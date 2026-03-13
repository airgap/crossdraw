declare module 'clipper-lib' {
  export type Path = Array<{ X: number; Y: number }>
  export type Paths = Path[]

  export const ClipType: {
    ctIntersection: number
    ctUnion: number
    ctDifference: number
    ctXor: number
  }

  export const PolyType: {
    ptSubject: number
    ptClip: number
  }

  export const PolyFillType: {
    pftEvenOdd: number
    pftNonZero: number
    pftPositive: number
    pftNegative: number
  }

  export const JoinType: {
    jtSquare: number
    jtRound: number
    jtMiter: number
  }

  export const EndType: {
    etClosedPolygon: number
    etClosedLine: number
    etOpenButt: number
    etOpenSquare: number
    etOpenRound: number
  }

  export class Clipper {
    AddPaths(paths: Paths, polyType: number, closed: boolean): void
    Execute(clipType: number, solution: Paths, subjFillType: number, clipFillType: number): boolean
  }

  export class ClipperOffset {
    MiterLimit: number
    ArcTolerance: number
    AddPaths(paths: Paths, joinType: number, endType: number): void
    Execute(solution: Paths, delta: number): void
  }
}
