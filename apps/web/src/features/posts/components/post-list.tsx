import { getPublishedPosts } from "../api/get-published-posts";

export async function PostList() {
  const posts = await getPublishedPosts();

  if (posts.length === 0) {
    return <p className="text-sm opacity-70">Chưa có bài viết nào.</p>;
  }

  return (
    <ul className="space-y-4">
      {posts.map((post) => (
        <li key={post.id} className="rounded-lg border border-black/10 p-4 dark:border-white/15">
          <h3 className="font-semibold">{post.title}</h3>
          {post.publishedAt && (
            <time className="text-xs opacity-60" dateTime={post.publishedAt}>
              {new Date(post.publishedAt).toLocaleDateString("vi-VN")}
            </time>
          )}
          <p className="mt-2 text-sm">{post.content}</p>
        </li>
      ))}
    </ul>
  );
}
