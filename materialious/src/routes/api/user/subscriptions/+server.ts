import { getUser } from '#lib/server/user';
import { error } from '@sveltejs/kit';

export async function GET({ locals }) {
	if (!locals.userId) error(401, 'Unauthorized');
	const user = await getUser(locals.userId);

	return Response.json({
		subscriptions: await user.subscriptions()
	});
}
