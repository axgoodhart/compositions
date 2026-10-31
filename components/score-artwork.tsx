import type { CSSProperties } from "react";
import type { Composition } from "@/lib/compositions";

export function ScoreArtwork({ piece }: { piece: Composition }) {
  const { cover } = piece;
  const style = { "--cover-image": `url("${cover.src}")`, "--cover-size": cover.size, "--cover-position": cover.position, "--cover-filter": cover.filter } as CSSProperties;
  return <div role="img" aria-label={`${piece.title}, original illustrated score cover`} className="score-artwork" style={style} />;
}
