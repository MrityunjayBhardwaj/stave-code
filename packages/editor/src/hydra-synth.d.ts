declare module 'hydra-synth' {
  interface HydraOptions {
    canvas?: HTMLCanvasElement
    width?: number
    height?: number
    detectAudio?: boolean
    makeGlobal?: boolean
    autoLoop?: boolean
    enableStreamCapture?: boolean
  }

  class Hydra {
    constructor(options?: HydraOptions)
    synth: any
    setResolution?(width: number, height: number): void
  }

  export default Hydra
}
