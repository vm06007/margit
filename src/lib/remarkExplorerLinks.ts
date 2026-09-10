interface MarkdownNode {
    type: string;
    value?: string;
    url?: string;
    children?: MarkdownNode[];
}

/** Link Arc identifiers without rewriting existing links or executable code blocks. */
export function remarkExplorerLinks() {
    return (tree: MarkdownNode) => {
        function walk(node: MarkdownNode) {
            if (!node.children || ['link', 'linkReference', 'code', 'html'].includes(node.type)) return;
            node.children = node.children.flatMap(child => {
                if (!['text', 'inlineCode'].includes(child.type) || !child.value) {
                    walk(child);
                    return [child];
                }
                const parts: MarkdownNode[] = [];
                const value = child.value;
                let offset = 0;
                for (const match of value.matchAll(/\b0x(?:[a-fA-F0-9]{64}|[a-fA-F0-9]{40})\b/g)) {
                    if (match.index > offset) parts.push({type: child.type, value: value.slice(offset, match.index)});
                    const identifier = match[0];
                    parts.push({
                        type: 'link',
                        url: `https://testnet.arcscan.app/${identifier.length === 66 ? 'tx' : 'address'}/${identifier}`,
                        children: [{type: child.type, value: identifier}],
                    });
                    offset = match.index + identifier.length;
                }
                if (!parts.length) return [child];
                if (offset < value.length) parts.push({type: child.type, value: value.slice(offset)});
                return parts;
            });
        }
        walk(tree);
    };
}
