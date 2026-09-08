import './hero-card-dismiss.css'

export function HeroCardDismiss({ name, dismissed, onToggle }: { name: string; dismissed: boolean; onToggle: () => void }) {
  return <button className="london-hero-dismiss" type="button" aria-label={`${dismissed ? 'Show' : 'Close'} ${name} card`} aria-expanded={!dismissed} onClick={onToggle}>
    {dismissed ? `${name} details` : <span aria-hidden="true">×</span>}
  </button>
}
