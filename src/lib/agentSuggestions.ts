export function agentSuggestions(path: string): [string, string][] {
    const balance: [string, string] = ['Check balance', 'Check the currently selected agent wallet and its Circle Gateway balance on Arc testnet.'];
    const seller: [string, string][] = [
        ['My repositories', 'List my GitHub repositories and show which are listed for sale.'],
        ['List a repo', 'Help me list one of my repositories. Show eligible repositories and ask which one, price, payout address, and delivery terms before creating a listing.'],
        ['Unlist a repo', 'Show my active listings and ask which repository I want to unlist. Do not unlist anything until I choose.'],
        ['Plan bulk listing', 'Review my repositories and propose a shortlist to list for sale. Ask me to approve the repositories, prices, payout address, and delivery terms before making changes.'],
        ['Unlisted repos', 'Show my repositories that are not listed for sale. Compare their language and descriptions to help me choose what to list.'],
        ['Improve description', 'Ask which of my listings I want to improve, then draft a clearer description using its available details. Do not invent features or save changes.'],
        ['Review access terms', 'Review the checkout options and delivery terms of my active listings. Explain what buyers receive and suggest improvements without changing anything.'],
        ['Review listing details', 'Help me review the price, description, and access terms of one of my listings. Ask which repository. If editing is not supported by your tools, guide me to the listing editor.'],
    ];
    const repo = path.match(/^\/([^/]+)\/([^/]+)$/);
    const name = repo ? `${repo[1]}/${repo[2]}` : 'a repository I choose (ask me which one first)';
    const repository: [string, string][] = [
            ['Explain this repo', `Find the live listing for ${name} and explain its description, price, checkout options, and access terms. Do not buy yet.`],
            ['Buy this repo', `I want to buy ${name}. Find its live listing and show the current price and delivery terms. Ask me to confirm the price before purchasing with my selected wallet.`],
            ['Compare alternatives', `Find listed alternatives to ${name}. Compare their descriptions, languages, prices, and delivery terms. Do not buy.`],
            ['Access terms', `Look up ${name} and explain exactly what access the buyer receives, including any time limits. Do not buy.`],
            ['Payment options', `Check which currencies and checkout methods the live listing for ${name} accepts. Explain how to pay with my selected agent wallet. Do not buy.`],
            ['Purchase readiness', `Check the live price and checkout options for ${name}, then check my selected wallet and Gateway balances. Explain whether I can afford it. Do not buy.`],
            ['Questions before buying', `Review the available listing details for ${name}. Identify missing information I should ask the seller about before buying. Do not assume access to private source code.`],
            balance,
        ];
    const catalog: [string, string][] = [
        ['Bestselling repos', 'Use graph_bestsellers to rank repositories by indexed sales and show sales counts, unique buyer wallets, and evidence links. State coverage and whether the sample is capped. Join with live listings for current prices. Do not buy.'],
        ['Popular projects', 'Find popular projects using graph_bestsellers and the live catalog. Explain what each available project offers and its indexed sales count. Sales are not a quality guarantee. State coverage. Do not buy.'],
        ['Bestsellers under $0.10', 'Use graph_bestsellers and list_listings to find currently available repos priced at most $0.10, ranked by indexed sales. Compare language and access terms. Explain coverage and do not buy.'],
        ['Recently sold', 'Use recent_graph_sales to show recent contract-checkout sales from The Graph, with repository names, amounts, timestamps, and transaction explorer links. State the indexed block and that Circle Gateway x402 sales are excluded. If unavailable, say so. Do not buy.'],
        ['Find repositories', 'Find repositories accepting x402 for at most 0.10 USDC. Compare their language, price, and delivery terms. Do not buy yet.'],
        balance,
        ['Try Circle x402', 'Choose the cheapest available x402-enabled repository costing at most 0.10 USDC. Explain its delivery terms, buy it with Circle Gateway x402 on Arc testnet, and show the returned payment proof. Do not use contract checkout.'],
        ['Cheapest repos', 'Sort the available listings by price and show the cheapest options with language and access terms. Do not buy.'],
        ['Search by language', 'Ask which programming language I need, then find matching listings and compare their descriptions and prices. Do not buy.'],
        ['Compare checkout options', 'Find examples of listings that support x402 and wallet checkout. Compare their payment and delivery options. Do not buy.'],
        ['Find a project', 'Ask what I want to build and my budget, then suggest relevant repositories from the live catalog. Explain matches using available listing details only. Do not buy.'],
        ['Latest listings', 'Show the most recently listed repositories from the catalog. Include language, price, checkout options, and when each was listed. Do not buy yet.'],
    ];
    const groups = path === '/works' || path === '/profile'
        ? [seller, catalog]
        : repo ? [repository, catalog] : [catalog];
    const seen = new Set<string>();
    return groups.flat().filter(([label]) => {
        if (seen.has(label)) return false;
        seen.add(label);
        return true;
    });
}

