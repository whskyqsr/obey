import { useAvatarUrl } from "../api/hooks";
import { CollarIcon } from "./CollarIcon";
import { cx } from "./ui";

/** A member's picture, or their initial on a tonal circle when they haven't added one. */
export function Avatar({
  userId,
  name,
  version,
  size = 40,
  collared,
  className,
}: {
  userId: string;
  name: string;
  version: string | null;
  size?: number;
  /** Shows a small collar badge at the bottom right. */
  collared?: boolean;
  className?: string;
}) {
  const url = useAvatarUrl(userId, version).data;
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const badge = Math.max(16, Math.round(size * 0.4));
  return (
    <span className={cx("relative inline-flex shrink-0 rounded-full", className)} style={{ width: size, height: size }} aria-hidden>
      <span
        className="inline-flex size-full items-center justify-center overflow-hidden rounded-full bg-secondary-container text-on-secondary-container"
        style={{ fontSize: size * 0.42 }}
      >
        {url ? <img src={url} alt="" className="size-full object-cover" /> : initial}
      </span>
      {collared && (
        <span
          className="absolute -right-0.5 -bottom-0.5 inline-flex items-center justify-center rounded-full bg-primary text-on-primary ring-2 ring-surface"
          style={{ width: badge, height: badge }}
          title="Collared"
        >
          <CollarIcon size={Math.round(badge * 0.7)} />
        </span>
      )}
    </span>
  );
}

/** Crops the middle square of an image file and shrinks it to 256px JPEG for upload. */
export async function squareJpeg(file: File, px = 256): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, px, px);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't read that image"))), "image/jpeg", 0.85));
}
