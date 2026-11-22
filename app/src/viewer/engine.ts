import { init as csInit, RenderingEngine, Enums, getRenderingEngine, metaData, utilities, type Types } from '@cornerstonejs/core'
import { init as loaderInit } from '@cornerstonejs/dicom-image-loader'
import {
  init as toolsInit, addTool, ToolGroupManager, Enums as ToolEnums, annotation,
  WindowLevelTool, PanTool, ZoomTool, StackScrollTool, LengthTool, AngleTool, CobbAngleTool,
  EllipticalROITool, RectangleROITool, PlanarRotateTool, ReferenceLinesTool,
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
    // manual calibration (Length → Calibrate…) is stored here; the renderer only sees it if the store is a provider
    const cal = utilities.calibratedPixelSpacingMetadataProvider
    metaData.addProvider((type: string, imageId: string) => cal.get(type, imageId), 11000)
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
    for (const T of [WindowLevelTool, PanTool, ZoomTool, StackScrollTool, LengthTool, AngleTool, CobbAngleTool, EllipticalROITool, RectangleROITool, PlanarRotateTool, ReferenceLinesTool]) addTool(T)

    new RenderingEngine(ENGINE_ID)
    const tg = ToolGroupManager.createToolGroup(TOOLGROUP_ID)!
    for (const name of Object.values(toolNames)) tg.addTool(name)
    tg.addTool(ReferenceLinesTool.toolName)
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

// ------------------------------------------------------------ sync + reference lines
/**
 * Auto sync: panels showing series in the same frame of reference follow each other's slice position.
 * The panel being used (`sourceId`) drives the others in `ids`; an empty list switches sync off.
 *
 * Our own listener rather than the renderer's image-slice synchronizer: in 5.19 that callback takes these
 * stack panels for volume slices and mirrors the target index (image 13 of 80 → image 66), and as a
 * two-way sync its late echoes pulled the panel being scrolled back and forth.
 */
let unsync: (() => void) | null = null
export function setSyncedViewports(sourceId: string | null, ids: string[]) {
  unsync?.()
  unsync = null
  const src = sourceId ? stackViewport(sourceId) : undefined
  const targets = ids.filter((id) => id !== sourceId)
  if (!src || !targets.length) return
  const follow = () => {
    const pos = plane(src.getCurrentImageId())?.imagePositionPatient
    if (!pos) return
    for (const id of targets) {
      const t = stackViewport(id)
      const list = t?.getImageIds() ?? []
      if (!t || !list.length) continue
      let best = -1, bestD = Infinity
      list.forEach((imageId, i) => {
        const p = plane(imageId)?.imagePositionPatient
        if (!p) return
        const d = (p[0] - pos[0]) ** 2 + (p[1] - pos[1]) ** 2 + (p[2] - pos[2]) ** 2
        if (d < bestD) { bestD = d; best = i }
      })
      if (best >= 0 && best !== t.getCurrentImageIdIndex()) t.setImageIdIndex(best).catch(() => {})
    }
  }
  const el = src.element
  el.addEventListener(Enums.Events.STACK_NEW_IMAGE, follow)
  follow()
  unsync = () => el.removeEventListener(Enums.Events.STACK_NEW_IMAGE, follow)
}
const plane = (imageId: string | undefined) =>
  imageId ? (metaData.get('imagePlaneModule', imageId) as { imagePositionPatient?: number[] } | undefined) : undefined

/** Draws the active panel's plane as a line on every other panel that cuts it (null switches them off). */
export function setReferenceSource(viewportId: string | null) {
  const tg = ToolGroupManager.getToolGroup(TOOLGROUP_ID)
  if (!tg) return
  const name = ReferenceLinesTool.toolName
  if (!viewportId) { tg.setToolDisabled(name); return }
  tg.setToolConfiguration(name, { sourceViewportId: viewportId })
  tg.setToolEnabled(name)
  engine()?.render()
}

export function engine() {
  return getRenderingEngine(ENGINE_ID) as RenderingEngine | undefined
}

export function stackViewport(viewportId: string) {
  return engine()?.getViewport(viewportId) as Types.IStackViewport | undefined
}

export const ViewportType = Enums.ViewportType
export const Events = Enums.Events
