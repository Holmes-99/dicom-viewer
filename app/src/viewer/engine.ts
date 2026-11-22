import { init as csInit, RenderingEngine, Enums, getRenderingEngine, type Types } from '@cornerstonejs/core'
import { init as loaderInit } from '@cornerstonejs/dicom-image-loader'
import {
  init as toolsInit, addTool, ToolGroupManager, Enums as ToolEnums, annotation,
  WindowLevelTool, PanTool, ZoomTool, StackScrollTool, LengthTool, AngleTool, CobbAngleTool,
  EllipticalROITool, RectangleROITool, PlanarRotateTool,
} from '@cornerstonejs/tools'

export const ENGINE_ID = 'main'
export const TOOLGROUP_ID = 'stack'

/** The viewer's tool ids (toolbar + shortcuts) mapped to renderer tools. */
export type ToolId = 'scroll' | 'wl' | 'zoom' | 'pan' | 'length' | 'angle' | 'cobb' | 'ellipse' | 'rect' | 'rotate'
const toolNames: Record<ToolId, string> = {
  scroll: StackScrollTool.toolName,
  wl: WindowLevelTool.toolName,
  zoom: ZoomTool.toolName,
  pan: PanTool.toolName,
  length: LengthTool.toolName,
  angle: AngleTool.toolName,
  cobb: CobbAngleTool.toolName,
  ellipse: EllipticalROITool.toolName,
  rect: RectangleROITool.toolName,
  rotate: PlanarRotateTool.toolName,
}

let ready: Promise<void> | null = null

export function initEngine() {
  if (ready) return ready
  ready = (async () => {
    await csInit()
    // The dicom-parser based path: in 5.19 the newer "naturalized" path finds no pixel data for local files.
    // Revisit when upgrading Cornerstone (build-log.md).
    loaderInit({
      maxWebWorkers: Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)),
      useLegacyMetadataProvider: true,
    } as Parameters<typeof loaderInit>[0])
    toolsInit()
    // measurement colours come from the design tokens
    const css = getComputedStyle(document.documentElement)
    const tok = (n: string) => css.getPropertyValue(n).trim()
    // merge into the defaults: setDefaultToolStyles replaces the whole set, text-box settings included
    const base = annotation.config.style.getDefaultToolStyles()
    annotation.config.style.setDefaultToolStyles({
      ...base,
      global: {
        ...base.global,
        color: tok('--annotation'),
        colorHighlighted: tok('--annotation-active'),
        colorSelected: tok('--annotation-active'),
        colorLocked: tok('--overlay-muted'),
        lineWidth: '1.5',
      },
    })
    for (const T of [WindowLevelTool, PanTool, ZoomTool, StackScrollTool, LengthTool, AngleTool, CobbAngleTool, EllipticalROITool, RectangleROITool, PlanarRotateTool]) addTool(T)

    new RenderingEngine(ENGINE_ID)
    const tg = ToolGroupManager.createToolGroup(TOOLGROUP_ID)!
    for (const name of Object.values(toolNames)) tg.addTool(name)
    setActiveTool('wl')
  })()
  return ready
}

const { MouseBindings } = ToolEnums

/**
 * Default mouse mapping (VERIFY against the original): left = the active tool, middle = pan,
 * right = zoom, wheel = scroll through slices. Annotation tools stay visible when not active.
 */
export function setActiveTool(id: ToolId) {
  const tg = ToolGroupManager.getToolGroup(TOOLGROUP_ID)
  if (!tg) return
  for (const name of Object.values(toolNames)) tg.setToolPassive(name, { removeAllBindings: true })
  const bindings: Record<string, { mouseButton: number }[]> = {}
  const bind = (name: string, b: number) => (bindings[name] ??= []).push({ mouseButton: b })
  bind(toolNames[id], MouseBindings.Primary)
  if (id !== 'pan') bind(toolNames.pan, MouseBindings.Auxiliary)
  if (id !== 'zoom') bind(toolNames.zoom, MouseBindings.Secondary)
  bind(toolNames.scroll, MouseBindings.Wheel)
  for (const [name, b] of Object.entries(bindings)) tg.setToolActive(name, { bindings: b })
}

export function engine() {
  return getRenderingEngine(ENGINE_ID) as RenderingEngine | undefined
}

export function stackViewport(viewportId: string) {
  return engine()?.getViewport(viewportId) as Types.IStackViewport | undefined
}

export const ViewportType = Enums.ViewportType
export const Events = Enums.Events
