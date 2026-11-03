import { createDocumentService } from "../modules/workspace/documents";
import { uploadRepository, privateFiles } from "../platform/storage/uploads";
export const documents = createDocumentService(uploadRepository, privateFiles);
import { createWorkspaceService } from "../modules/workspace/saved-items";
import { savedItemsRepository } from "../platform/storage/saved-items";
import { paperRepository } from "./providers";
export const workspace = createWorkspaceService(
  savedItemsRepository,
  paperRepository,
);
