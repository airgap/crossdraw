/**
 * Interactive Components (#95)
 *
 * Allows components (symbol instances) to have multiple visual states with
 * triggers that switch between them.  This powers hover effects, toggle
 * buttons, tab bars, and other stateful UI patterns in prototyping.
 *
 * Each InteractiveComponent has:
 * - A list of named states (each is a snapshot of layer visibility/opacity)
 * - A list of triggers (click, hover, press) that transition to a target state
 */

import { v4 as uuid } from 'uuid'

// ── Types ────────────────────────────────────────────────────────────────────

export interface ComponentState {
  id: string
  name: string
  /** Layer visibility overrides: layerId → visible. */
  layerVisibility: Record<string, boolean>
  /** Optional layer opacity overrides: layerId → opacity (0-1). */
  layerOpacity?: Record<string, number>
  /** Optional description for documentation purposes. */
  description?: string
}

export type TriggerType = 'click' | 'hover' | 'press' | 'long-press' | 'drag'

export interface Trigger {
  id: string
  /** Event that activates this trigger. */
  type: TriggerType
  /** ID of the target ComponentState to transition to. */
  targetState: string
  /** Optional: specific layer that acts as the trigger area. If omitted, the whole component triggers. */
  sourceLayerId?: string
  /** Transition duration in ms (0 = instant). */
  transitionDuration: number
  /** Easing curve for the transition. */
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'
}

export interface InteractiveComponent {
  id: string
  name: string
  /** The initial/default state ID. */
  defaultState: string
  /** All possible visual states. */
  states: ComponentState[]
  /** Triggers that cause state transitions. */
  triggers: Trigger[]
}

// ── Factory functions ────────────────────────────────────────────────────────

export function createComponentState(name: string, layerVisibility: Record<string, boolean> = {}): ComponentState {
  return {
    id: uuid(),
    name,
    layerVisibility,
  }
}

export function createTrigger(
  type: TriggerType,
  targetState: string,
  options?: Partial<Pick<Trigger, 'sourceLayerId' | 'transitionDuration' | 'easing'>>,
): Trigger {
  return {
    id: uuid(),
    type,
    targetState,
    sourceLayerId: options?.sourceLayerId,
    transitionDuration: options?.transitionDuration ?? 200,
    easing: options?.easing ?? 'ease-in-out',
  }
}

export function createInteractiveComponent(name: string): InteractiveComponent {
  const defaultState = createComponentState('Default')
  return {
    id: uuid(),
    name,
    defaultState: defaultState.id,
    states: [defaultState],
    triggers: [],
  }
}

// ── Interactive Component Manager ────────────────────────────────────────────

export class InteractiveComponentManager {
  private components: Map<string, InteractiveComponent> = new Map()

  constructor(initial?: InteractiveComponent[]) {
    if (initial) {
      for (const comp of initial) {
        this.components.set(comp.id, comp)
      }
    }
  }

  // ── Component CRUD ──

  getComponents(): InteractiveComponent[] {
    return Array.from(this.components.values())
  }

  getComponent(id: string): InteractiveComponent | undefined {
    return this.components.get(id)
  }

  createComponent(name: string): InteractiveComponent {
    const comp = createInteractiveComponent(name)
    this.components.set(comp.id, comp)
    return comp
  }

  deleteComponent(id: string): boolean {
    return this.components.delete(id)
  }

  // ── State management ──

  addState(componentId: string, name: string, layerVisibility: Record<string, boolean> = {}): ComponentState | null {
    const comp = this.components.get(componentId)
    if (!comp) return null
    const state = createComponentState(name, layerVisibility)
    comp.states.push(state)
    return state
  }

  updateState(
    componentId: string,
    stateId: string,
    updates: Partial<Pick<ComponentState, 'name' | 'layerVisibility' | 'layerOpacity' | 'description'>>,
  ): ComponentState | null {
    const comp = this.components.get(componentId)
    if (!comp) return null
    const state = comp.states.find((s) => s.id === stateId)
    if (!state) return null

    if (updates.name !== undefined) state.name = updates.name
    if (updates.layerVisibility !== undefined) state.layerVisibility = updates.layerVisibility
    if (updates.layerOpacity !== undefined) state.layerOpacity = updates.layerOpacity
    if (updates.description !== undefined) state.description = updates.description
    return state
  }

  removeState(componentId: string, stateId: string): boolean {
    const comp = this.components.get(componentId)
    if (!comp) return false
    // Cannot remove the default state
    if (comp.defaultState === stateId) return false
    const before = comp.states.length
    comp.states = comp.states.filter((s) => s.id !== stateId)
    // Remove any triggers pointing to this state
    comp.triggers = comp.triggers.filter((t) => t.targetState !== stateId)
    return comp.states.length < before
  }

  // ── Trigger management ──

  addTrigger(
    componentId: string,
    type: TriggerType,
    targetState: string,
    options?: Partial<Pick<Trigger, 'sourceLayerId' | 'transitionDuration' | 'easing'>>,
  ): Trigger | null {
    const comp = this.components.get(componentId)
    if (!comp) return null
    // Validate target state exists
    if (!comp.states.some((s) => s.id === targetState)) return null
    const trigger = createTrigger(type, targetState, options)
    comp.triggers.push(trigger)
    return trigger
  }

  removeTrigger(componentId: string, triggerId: string): boolean {
    const comp = this.components.get(componentId)
    if (!comp) return false
    const before = comp.triggers.length
    comp.triggers = comp.triggers.filter((t) => t.id !== triggerId)
    return comp.triggers.length < before
  }

  // ── State resolution ──

  /**
   * Resolve the visual state for a component given the currently active state ID.
   * Returns the merged layer visibility map.
   */
  resolveState(componentId: string, stateId: string): Record<string, boolean> | null {
    const comp = this.components.get(componentId)
    if (!comp) return null
    const state = comp.states.find((s) => s.id === stateId)
    if (!state) return null
    return { ...state.layerVisibility }
  }

  /**
   * Get the next state ID given a trigger type on a component in a given state.
   */
  getNextState(componentId: string, _currentStateId: string, triggerType: TriggerType): string | null {
    const comp = this.components.get(componentId)
    if (!comp) return null
    const trigger = comp.triggers.find((t) => t.type === triggerType)
    if (!trigger) return null
    return trigger.targetState
  }
}
