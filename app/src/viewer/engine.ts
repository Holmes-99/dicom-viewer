import { init as csInit, RenderingEngine, Enums, getRenderingEngine, metaData, utilities, type Types } from '@cornerstonejs/core'
import { init as loaderInit } from '@cornerstonejs/dicom-image-loader'
import {
  init as toolsInit, addTool, ToolGroupManager, Enums as ToolEnums, annotation,
  WindowLevelTool, PanTool, ZoomTool, StackScrollTool, LengthTool, AngleTool, CobbAngleTool,
  EllipticalROITool, RectangleROITool, PlanarRotateTool, ReferenceLinesTool, SynchronizerManager, synchronizers,
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
    synchronizers.createImageSliceSynchronizer(SLICE_SYNC_ID)
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
const SLICE_SYNC_ID = 'slice-sync'

/**
 * Auto sync: panels showing series in the same frame of reference follow each other's slice position.
 * Pass the viewport ids that should take part; an empty list switches sync off.
 */
export function setSyncedViewports(ids: string[]) {
  const sync = SynchronizerManager.getSynchronizer(SLICE_SYNC_ID)
  if (!sync) return
  const re = engine()
  if (!re) return
  const want = new Set(ids)
  for (const v of sync.getSourceViewports()) if (!want.has(v.viewportId)) sync.remove({ renderingEngineId: re.id, viewportId: v.viewportId })
  const have = new Set(sync.getSourceViewports().map((v) => v.viewportId))
  for (const id of ids) if (!have.has(id) && re.getViewport(id)) sync.add({ renderingEngineId: re.id, viewportId: id })
}

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
