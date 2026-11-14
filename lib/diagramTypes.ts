// Shared between the server (spec builder) and the chat window (SVG renderer).
// All dimensions are in inches.

export type Material =
  | "turf"
  | "mulch"
  | "stone"
  | "aggregate"
  | "sand"
  | "setting"
  | "paver"
  | "concrete"
  | "asphalt"
  | "rubber"
  | "base"
  | "openbase"
  | "soil"
  | "growing"
  | "tray";

export type Layer = { label: string; material: Material; thickness: number };

export type EdgeKind = "vertical" | "permastrip" | "restraint" | "geoedge";

export type DiagramSpec = {
  title: string; // e.g. 'StructurEdge 3/16" x 1-5/8"'
  subtitle: string; // e.g. "Brick paver on concrete"
  product: {
    family: string;
    kind: EdgeKind;
    height: number; // wall height
    base: number; // horizontal flange width (0 for straight edging)
    extender: number; // GeoEdge EX4 extender height added on top (0 if none)
    label: string;
  };
  anchor: { type: "stake" | "spike" | "pin" | "none"; length: number; label: string };
  /** Layers from the top down. "inside" is the side the edging retains (bed, paver, asphalt…). */
  inside: Layer[];
  outside: Layer[];
  /** Extras drawn on top of the section. */
  geogrid?: boolean;
  /** Short notes shown under the drawing. */
  notes: string[];
};
