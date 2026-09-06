import {
  BookOpen,
  CircleHelp,
  Flag,
  Gem,
  Globe2,
  Landmark,
  MapPin,
  Orbit,
  Sparkles,
  UserRound,
  Waves,
  type LucideIcon,
} from 'lucide-react'
import type { EntityType } from '../domain/schema'
import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react'
import { cn } from '../lib/utils'
import { Button } from './ui/button'
export const entityIcons: Record<EntityType, LucideIcon> = {
  Character: UserRound,
  Location: MapPin,
  Faction: Flag,
  Culture: Globe2,
  Species: Waves,
  Item: Gem,
  Event: Sparkles,
  Religion: Landmark,
  System: Orbit,
  Concept: CircleHelp,
  Encyclopedia: BookOpen,
}
export function EntityIcon({ type, small = false }: { type: EntityType; small?: boolean }) {
  const Icon = entityIcons[type]
  return (
    <span
      className={cn('entity-icon', `entity-${type.toLowerCase()}`, small && 'entity-icon-small')}
    >
      <Icon size={small ? 16 : 22} strokeWidth={1.5} />
    </span>
  )
}
export function Badge({ children, variant = '' }: { children: ReactNode; variant?: string }) {
  return (
    <span className={cn('badge', variant && `badge-${variant.toLowerCase()}`)}>{children}</span>
  )
}
export function PageHeading({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="heading-actions">{actions}</div>
    </div>
  )
}
export function Empty({
  icon: Icon = BookOpen,
  title,
  description,
  action,
  onAction,
}: {
  icon?: LucideIcon
  title: string
  description: string
  action?: string
  onAction?: () => void
}) {
  return (
    <div className="empty">
      <Icon size={32} strokeWidth={1.2} />
      <h3>{title}</h3>
      <p>{description}</p>
      {action && <Button onClick={onAction}>{action}</Button>}
    </div>
  )
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string
  children: ReactNode
  hint?: string
}) {
  const id = useId()
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {isValidElement(children)
        ? cloneElement(children as ReactElement<{ id?: string; 'aria-describedby'?: string }>, {
            id,
            'aria-describedby': hint ? `${id}-hint` : undefined,
          })
        : children}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  )
}
