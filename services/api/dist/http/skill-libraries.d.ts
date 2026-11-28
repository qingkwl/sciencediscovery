import type { IncomingMessage, ServerResponse } from "node:http";
import { SkillLibraryCatalog } from "../skill-library-catalog.js";
export declare function handleSkillLibraryRequest(options: {
    catalog: SkillLibraryCatalog;
    request: IncomingMessage;
    response: ServerResponse;
    url: URL;
}): Promise<boolean>;
