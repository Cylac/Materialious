const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');
const { Sequelize, DataTypes, Op } = require('sequelize');
const sqlite3 = require('sqlite3');

function loadActualUserModule(getSequelize) {
  const file = path.resolve(__dirname, '../src/lib/server/user.ts');
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    require(name) {
      if (name === './database') return { getSequelize };
      if (name === 'sequelize') return { Op };
      if (name === 'crypto') return crypto;
      if (name === '@sveltejs/kit') return { error(status) { throw Object.assign(new Error('HTTP error'), { status }); } };
      if (name === '#lib/auth/userCreateError') return { USERNAME_TAKEN: 'Username taken' };
      throw new Error('Unexpected import: ' + name);
    },
    TextEncoder,
    Buffer
  }, { filename: file, timeout: 5000 });
  return module.exports.User;
}

async function fixture(t) {
  // In-memory SQLite with the same UserId association used by Materialious.
  // No filesystem database, live session or network is involved.
  const sequelize = new Sequelize('sqlite::memory:', { logging: false, dialectModule: sqlite3 });
  t.after(async () => sequelize.close());
  const UserTable = sequelize.define('User', {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    username: { type: DataTypes.STRING, allowNull: false, unique: true }
  });
  const ChannelSubscriptionTable = sequelize.define('Subscriptions', {
    id: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
    channelIdCipher: { type: DataTypes.STRING, allowNull: false },
    channelIdNonce: { type: DataTypes.STRING, allowNull: false },
    channelNameCipher: { type: DataTypes.STRING, allowNull: false },
    channelNameNonce: { type: DataTypes.STRING, allowNull: false },
    lastRSSFetch: { type: DataTypes.DATE, allowNull: false }
  });
  UserTable.hasMany(ChannelSubscriptionTable);
  await sequelize.sync({ force: true });

  const a = crypto.randomUUID();
  const b = crypto.randomUUID();
  await UserTable.bulkCreate([{ id: a, username: 'test-a' }, { id: b, username: 'test-b' }]);
  const User = loadActualUserModule(() => ({ ChannelSubscriptionTable }));
  const actorA = new User({ id: a, username: 'test-a' });
  const actorB = new User({ id: b, username: 'test-b' });

  const subscription = (id, owner) => ({
    id,
    UserId: owner,
    channelIdCipher: 'cipher',
    channelIdNonce: 'nonce',
    channelNameCipher: 'cipher',
    channelNameNonce: 'nonce',
    lastRSSFetch: new Date(0)
  });

  return { actorA, actorB, ChannelSubscriptionTable, a, b, subscription };
}

test('real SQLite queries keep subscriptions separated by owner', async (t) => {
  const { actorA, actorB, ChannelSubscriptionTable, a, b, subscription } = await fixture(t);
  await ChannelSubscriptionTable.bulkCreate([
    subscription('subscription-a', a),
    subscription('subscription-b', b)
  ]);

  assert.equal(await actorA.amSubscribed('subscription-b'), false);
  assert.equal(await actorA.amSubscribed('subscription-a'), true);
  assert.equal(await actorB.amSubscribed('subscription-a'), false);

  const aList = await actorA.subscriptions();
  const bList = await actorB.subscriptions();
  assert.deepEqual(Array.from(aList, (item) => item.get('id')), ['subscription-a']);
  assert.deepEqual(Array.from(bList, (item) => item.get('id')), ['subscription-b']);

  await actorA.removeSubscription('subscription-b');
  assert.equal(await ChannelSubscriptionTable.count({ where: { id: 'subscription-b' } }), 1);
  await actorB.removeSubscription('subscription-b');
  assert.equal(await ChannelSubscriptionTable.count({ where: { id: 'subscription-b' } }), 0);
});
