import type { BlogPost } from './blog'

/** Publication is retained for metadata; readers see one truthful update date. */
export function postUpdatedDate(post: Pick<BlogPost, 'date' | 'updated'>): string {
  return post.updated ?? post.date
}

export function postDateLabel(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  })
}
