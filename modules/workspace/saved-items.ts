import type { PaperRepository } from "../../shared/ports";
import type { ResearchIdea } from "../../shared/models";
export type PrivateUploadSummary = {
    id: string;
    fileName: string;
    fileSize: number;
    pageCount: number;
    createdAt: string;
};
export interface SavedItemsRepository {
    paperIds(userId: string): Promise<string[]>;
    setPaper(userId: string, paperId: string, saved: boolean): Promise<void>;
    savedIdeas(userId: string): Promise<ResearchIdea[]>;
    uploads(userId: string): Promise<PrivateUploadSummary[]>;
}
export function createWorkspaceService(items: SavedItemsRepository, papers: Pick<PaperRepository, "find">) {
    function authenticated(userId: string) { if (!userId)
        throw new Error("请先登录"); }
    return {
        async list(userId: string) {
            authenticated(userId);
            const [ids, ideas, uploads] = await Promise.all([items.paperIds(userId), items.savedIdeas(userId), items.uploads(userId)]);
            return { savedPapers: (await Promise.all(ids.map(id => papers.find(id)))).filter(Boolean), ideas: ideas.filter(idea => idea.favorite === true), uploads };
        },
        async savePaper(userId: string, id: string, saved: boolean) {
            authenticated(userId);
            if (!await papers.find(id))
                return null;
            await items.setPaper(userId, id, saved);
            return { paperId: id, saved };
        },
    };
}
