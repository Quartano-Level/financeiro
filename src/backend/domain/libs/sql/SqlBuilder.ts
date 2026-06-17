export interface SqlBuildResult {
    query: string;
    params: unknown[];
}

export default class SqlBuilder {
    public build = (query: string, namedParams: Record<string, unknown>): SqlBuildResult => {
        if (/\$[0-9]+/.test(query) && /\$[a-zA-Z_]/.test(query)) {
            throw new Error('Mixed named and positional params are not allowed in the same query');
        }

        const namedParamRegex = /\$([a-zA-Z_][a-zA-Z0-9_]*)/g;
        const nameToIndex = new Map<string, number>();
        const params: unknown[] = [];

        for (const match of query.matchAll(namedParamRegex)) {
            const name = match[1];
            if (!nameToIndex.has(name)) {
                if (!(name in namedParams)) {
                    throw new Error(
                        `Named parameter "$${name}" is referenced in the query but not provided`,
                    );
                }
                nameToIndex.set(name, params.push(namedParams[name]));
            }
        }

        const convertedQuery = query.replace(
            /\$([a-zA-Z_][a-zA-Z0-9_]*)/g,
            (_, name) => `$${nameToIndex.get(name)}`,
        );

        return { query: convertedQuery, params };
    };
}
