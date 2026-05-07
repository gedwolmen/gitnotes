export type AttachmentType = 'image' | 'file';

export interface Attachment {
  id: string;
  uri: string;
  type: AttachmentType;
  name: string;
  mimeType?: string;
  size?: number;
  width?: number;
  height?: number;
  createdAt: number;
}

export interface AttachmentCreateInput {
  uri: string;
  type: AttachmentType;
  name: string;
  mimeType?: string;
  size?: number;
  width?: number;
  height?: number;
}

function generateId(): string {
  return `att-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export function createAttachment(input: AttachmentCreateInput): Attachment {
  return {
    id: generateId(),
    uri: input.uri,
    type: input.type,
    name: input.name,
    mimeType: input.mimeType,
    size: input.size,
    width: input.width,
    height: input.height,
    createdAt: Date.now(),
  };
}