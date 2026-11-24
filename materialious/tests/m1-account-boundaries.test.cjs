const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');

// Run the actual unmodified TypeScript module bodies with only their external
// dependencies replaced by local stubs. No network, user accounts or live DB.
function loadTypeScript(relativePath, dependencies) {
  const file = path.join(__dirname, '../src', relativePath);
  const source = fs.readFileSync(file, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    },
    fileName: file,
    reportDiagnostics: true
  });
  const errors = (transpiled.diagnostics || []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error
  );
  assert.equal(errors.length, 0, 'TypeScript transpilation failed');

  const module = { exports: {} };
  vm.runInNewContext(
    transpiled.outputText,
    {
      module,
      exports: module.exports,
      require(name) {
        if (!Object.hasOwn(dependencies, name)) {
          throw new Error('Unexpected import in regression test: ' + name);
        }
        return dependencies[name];
      },
      Response,
      TextEncoder,
      Buffer
    },
    { filename: file, timeout: 5000 }
  );
  return module.exports;
}

function fakeSubscriptionDatabase(initialRecords) {
  const records = initialRecords.map((record) => ({ ...record }));
  const matches = (record, where) =>
    Object.entries(where).every(([field, value]) => record[field] === value);

  return {
    records,
    sequelize: {
      ChannelSubscriptionTable: {
        async count({ where }) {
          return records.filter((record) => matches(record, where)).length;
        },
        async destroy({ where }) {
          let deleted = 0;
          for (let index = records.length - 1; index >= 0; index -= 1) {
            if (matches(records[index], where)) {
              records.splice(index, 1);
              deleted += 1;
            }
          }
          return deleted;
        },
        async findAll({ where }) {
          return records.filter((record) => matches(record, where));
        }
      }
    }
  };
}

function userWithFakeDatabase(initialRecords) {
  const database = fakeSubscriptionDatabase(initialRecords);
  const { User } = loadTypeScript('lib/server/user.ts', {
    './database': { getSequelize: () => database.sequelize },
    sequelize: { Op: { or: Symbol.for('m1-test-or') } },
    crypto,
    '@sveltejs/kit': {
      error(code) {
        const exception = new Error('SvelteKit HTTP ' + code);
        exception.status = code;
        throw exception;
      }
    },
    '#lib/auth/userCreateError': { USERNAME_TAKEN: 'Username taken' }
  });
  return { database, User };
}

test('subscription checks cannot reveal a record owned by another user', async () => {
  const { database, User } = userWithFakeDatabase([
    { id: 'subscription-owned-by-b', UserId: 'user-b' },
    { id: 'subscription-owned-by-a', UserId: 'user-a' }
  ]);
  const actorA = new User({ id: 'user-a', username: 'user-a' });
  const actorB = new User({ id: 'user-b', username: 'user-b' });

  assert.equal(await actorA.amSubscribed('subscription-owned-by-b'), false);
  assert.equal(await actorA.amSubscribed('subscription-owned-by-a'), true);
  assert.equal(await actorB.amSubscribed('subscription-owned-by-b'), true);
  assert.equal(database.records.length, 2);
});

test('subscription deletion cannot change records owned by another user', async () => {
  const { database, User } = userWithFakeDatabase([
    { id: 'subscription-owned-by-b', UserId: 'user-b' }
  ]);
  const actorA = new User({ id: 'user-a', username: 'user-a' });
  const actorB = new User({ id: 'user-b', username: 'user-b' });

  await actorA.removeSubscription('subscription-owned-by-b');
  assert.equal(database.records.length, 1);
  assert.equal(database.records[0].UserId, 'user-b');

  await actorB.removeSubscription('subscription-owned-by-b');
  assert.equal(database.records.length, 0);
});

test('subscription listing consistently uses the database UserId foreign key', async () => {
  const { User } = userWithFakeDatabase([
    { id: 'a-only', UserId: 'user-a' },
    { id: 'b-only', UserId: 'user-b' }
  ]);
  const actorA = new User({ id: 'user-a', username: 'user-a' });
  const results = await actorA.subscriptions();
  assert.equal(results.length, 1);
  assert.equal(results[0].id, 'a-only');
});

function unauthorizedDependencies() {
  const unauthorized = () => {
    const exception = new Error('Unauthorized');
    exception.status = 401;
    throw exception;
  };
  return {
    '#lib/server/user': {
      getUser: async () => {
        throw new Error('getUser must not be called without authentication');
      }
    },
    '@sveltejs/kit': { error: unauthorized },
    zod: {
      string: () => ({ max: () => ({}) }),
      object: () => ({
        safeParse: () => {
          throw new Error('Request body must not be read without authentication');
        }
      })
    }
  };
}

test('anonymous subscription collection requests return HTTP 401', async () => {
  const routes = loadTypeScript('routes/api/user/subscriptions/+server.ts', unauthorizedDependencies());
  await assert.rejects(routes.GET({ locals: {} }), (error) => error.status === 401);
});

test('anonymous subscription item methods reject before any request parsing', async () => {
  const routes = loadTypeScript('routes/api/user/subscriptions/[id]/+server.ts', unauthorizedDependencies());
  for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
    await assert.rejects(
      routes[method]({ locals: {}, params: { id: 'any' } }),
      (error) => error.status === 401,
      method + ' must return 401 before querying user content'
    );
  }
});

test('logout deletes the same path used for the authentication cookie', () => {
  const cookieSet = [];
  const cookieDeleted = [];

  const misc = loadTypeScript('lib/server/misc.ts', {
    'cookie-signature': { sign: (id) => 'signed_' + id },
    '$app/env/private': { COOKIE_SECRET: 'test-only-cookie-secret' }
  });
  const logout = loadTypeScript('routes/api/user/logout/+server.ts', {});

  misc.setAuthCookie('disposable-user', {
    set: (name, value, options) => cookieSet.push({ name, path: options.path })
  });
  logout.DELETE({
    cookies: {
      delete: (name, options) => cookieDeleted.push({ name, path: options.path })
    }
  });
  assert.equal(cookieSet.length, 1);
  assert.equal(cookieDeleted.length, 1);
  assert.equal(cookieDeleted[0].name, cookieSet[0].name);
  assert.equal(cookieDeleted[0].path, cookieSet[0].path);
});
