import type {
  APIAttachment,
  Attachment,
  AttachmentBuilder,
  AttachmentPayload,
  BufferResolvable,
  JSONEncodable,
} from "discord.js";
import fs from "fs";
import type Stream from "stream";
export interface FilesArrayType extends Array<
  | BufferResolvable
  | Stream
  | JSONEncodable<APIAttachment>
  | Attachment
  | AttachmentBuilder
  | AttachmentPayload
> {}
export async function saveImage(
  filesArray: FilesArrayType,
  filename: string,
  path: string,
): Promise<void> {
  try {
    const file = filesArray[0] as Attachment;

    const response = await fetch(file.url);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const extension = file.name?.split(".").pop() ?? "png";
    const proofPath = `${path}/${filename}.${extension}`;

    fs.writeFileSync(proofPath, buffer);
  } catch (error) {
    console.error("Error saving image:", error);
  }
}
