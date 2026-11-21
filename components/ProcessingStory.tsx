import Link from 'next/link'
import Icon from './Icon'
const DEFAULT_STEPS = [
  { title: 'Select your files', description: 'Formats and limits are checked first.' },
  { title: 'Choose your settings', description: 'Start with Recommended. Adjust when needed.' },
  { title: 'Review and download', description: 'Check quality and size before replacing an original.' },
]
export default function ProcessingStory({ steps = DEFAULT_STEPS }: { steps?: { title: string; description: string }[] }) {
  return <section className="processingStory" id="how" aria-labelledby="how-heading">
    <div className="storyCopy"><span className="sectionLabel">A SHORTER PATH TO YOUR FILE</span><h2 id="how-heading">Select. Adjust. Save.</h2><p>Choose your file, review the settings and compare the actual result. The processing stays in this browser.</p><ol>
      {steps.map((step, index) => <li key={index}><b>{String(index + 1).padStart(2, '0')}</b><span><strong>{step.title}</strong><small>{step.description}</small></span></li>)}
    </ol></div>
    <div className="localFlow" id="privacy"><div className="flowChrome"><i /><i /><i /><span>On your device</span></div><div className="flowCanvas"><span className="flowFile"><Icon name="file" /><small>Your file</small></span><Icon name="arrow" /><span className="flowEngine"><Icon name="spark" /><small>Process</small></span><Icon name="arrow" /><span className="flowFile"><Icon name="download" /><small>Result</small></span></div><div className="flowPrivacy"><Icon name="shield" /><div><h3>Your files stay with you.</h3><p>Engine code downloads when needed. Your selected files are processed on your device.</p><Link className="tertiaryAction" href="/privacy">How your files are handled<Icon name="arrow" /></Link></div></div></div>
  </section>
}
