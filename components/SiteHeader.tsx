import { TOOLS } from '@/lib/tools'
import { FOOTER_SITE_LINKS, TOOL_GROUPS, toolsInGroup } from '@/lib/nav'
import SiteHeaderNavigation from './SiteHeaderNavigation'

/** Keep encoder options, FAQs and SEO copy out of the shared client graph. */
export default function SiteHeader() {
  const groups = TOOL_GROUPS.map(group => ({
    key: group.key,
    title: group.title,
    tools: toolsInGroup(group).map(({ slug, title, description }) => ({ slug, title, description })),
  }))
  return <SiteHeaderNavigation groups={groups} legalLinks={FOOTER_SITE_LINKS} toolCount={TOOLS.length} />
}
