import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BlogPost } from '@/lib/blog'

const { readPublishedPosts } = vi.hoisted(() => ({ readPublishedPosts: vi.fn<() => BlogPost[]>() }))
vi.mock('@/lib/content', () => ({ readPublishedPosts }))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
  readPublishedPosts.mockReset()
})

function post(slug: string, title: string, date: string, text = title): BlogPost {
  return { slug, title, date, description: 'An editorial guide.', readingTime: '2 min', figure: 'pipeline', body: [{ type: 'p', text }] }
}

describe('blog catalog freshness', () => {
  it('reflects edits, new posts and removed publications after module load in development', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const initial = [post('guide', 'Original title', '2026-01-01'), post('removed', 'Archived later', '2026-01-02')]
    readPublishedPosts.mockReturnValue(initial)
    const blog = await import('@/lib/blog')
    expect(blog.getPost('guide')?.title).toBe('Original title')

    const edited = post('guide', 'Updated title', '2026-11-20', 'Updated article body.')
    const added = post('new-guide', 'New guide', '2026-11-23')
    readPublishedPosts.mockReturnValue([edited, added])
    expect(blog.getPost('guide')).toEqual(edited)
    expect(blog.getPost('guide')?.body).toEqual([{ type: 'p', text: 'Updated article body.' }])
    expect(blog.getPost('removed')).toBeUndefined()
    expect(blog.getPost('new-guide')).toEqual(added)
    expect(blog.allPostSlugs()).toEqual(['guide', 'new-guide'])
    expect(blog.postsByDate()).toEqual([added, edited])
    expect(blog.BLOG_POSTS).toBe(initial)

    readPublishedPosts.mockReturnValue([])
    expect(blog.getPost('guide')).toBeUndefined()
    expect(blog.allPostSlugs()).toEqual([])
    expect(blog.postsByDate()).toEqual([])
  })

  it('keeps the production snapshot and ordering stable when source content later changes', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const older = post('older', 'Original title', '2026-01-01', 'Original body.')
    const newer = post('newer', 'Newer guide', '2026-01-02')
    const initial = [older, newer]
    readPublishedPosts.mockReturnValue(initial)
    const blog = await import('@/lib/blog')

    readPublishedPosts.mockReturnValue([post('replacement', 'Changed source', '2026-11-23')])
    expect(blog.getPost('older')).toEqual(older)
    expect(blog.getPost('replacement')).toBeUndefined()
    expect(blog.allPostSlugs()).toEqual(['older', 'newer'])
    expect(blog.postsByDate()).toEqual([newer, older])
    expect(blog.BLOG_POSTS).toBe(initial)
    expect(initial).toEqual([older, newer])
    expect(readPublishedPosts).toHaveBeenCalledTimes(1)
  })
})
