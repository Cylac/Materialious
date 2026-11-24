export function DELETE({ cookies }) {
	cookies.delete('userid', { path: '/api' });

	return new Response();
}
