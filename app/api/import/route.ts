import { z } from "zod";
import { requireApiUser, errorResponse, json, ApiError } from "../../../lib/api-auth";
import { previewImport, applyImport, verifyImport, resumeImport } from "../../../lib/import-service";

async function boundedJson(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "An import request is required.");
  const parts: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 2_000_000) { await reader.cancel(); throw new ApiError(413, "Import request is too large."); }
    parts.push(value);
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) { body.set(part, offset); offset += part.length; }
  return JSON.parse(new TextDecoder().decode(body));
}
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("preview"), csv: z.string().max(1_000_000), mode: z.enum(["merge", "restore"]) }),
  z.object({ action: z.literal("apply"), id: z.string().uuid(), confirmation: z.string().max(50) }),
  z.object({ action: z.literal("verify"), id: z.string().uuid(), offset: z.number().int().min(0).max(2000) }),
  z.object({ action: z.literal("resume"), id: z.string().uuid() }),
]);

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request, true);
    const input = schema.parse(await boundedJson(request));
    const result = input.action === "preview" ? await previewImport(user, input.csv, input.mode)
      : input.action === "apply" ? await applyImport(user, input.id, input.confirmation)
      : input.action === "verify" ? await verifyImport(user, input.id, input.offset)
      : await resumeImport(user, input.id);
    return json({ ok: true, ...result }, "outcome" in result && result.outcome === "processing" ? 202 : 200);
  } catch (error) { return errorResponse(error); }
}
