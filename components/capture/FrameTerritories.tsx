/**
 * The boxes where the layers of the generated event frame will be, each as a 50% black territory (camera#236). Shown
 * over the live view and the reframe step instead of the frame itself; the logo is only a box, never its image.
 * Fills its positioned parent, which must have the frame's shape.
 */

import { FRAME_TERRITORY_FILL } from '@/lib/gds/tokens/colors';
import type { Territory } from '@/lib/frame/capture';

export default function FrameTerritories({ territories }: { territories: readonly Territory[] }) {
  return (
    <div aria-hidden="true" data-frame-territories className="pointer-events-none absolute inset-0 overflow-hidden">
      {territories.map((box) => (
        <div
          key={box.id}
          data-territory={box.id}
          className="absolute"
          style={{
            left: `${box.left * 100}%`,
            top: `${box.top * 100}%`,
            width: `${box.width * 100}%`,
            height: `${box.height * 100}%`,
            backgroundColor: FRAME_TERRITORY_FILL,
          }}
        />
      ))}
    </div>
  );
}
