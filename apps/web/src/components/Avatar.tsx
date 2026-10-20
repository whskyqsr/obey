import { useAvatarUrl } from "../api/hooks";
import { cx } from "./ui";

/** A member's picture, or their initial on a tonal circle when they haven't added one. */
export function Avatar({
  userId,
  name,
  version,
  size = 40,
  className,
}: {
  userId: string;
  name: string;
  version: string | null;
  size?: number;
  className?: string;
}) {
  const url = useAvatarUrl(userId, version).data;
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      className={cx("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary-container text-on-secondary-container", className)}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden
    >
      {url ? <img src={url} alt="" className="size-full object-cover" /> : initial}
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
