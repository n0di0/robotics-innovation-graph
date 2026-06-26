/**
 * Robotics Innovation Graph - Interactions
 * Event handlers for UI controls and user interactions
 */

document.addEventListener('DOMContentLoaded', () => {
    setupControlHandlers();
    setupPanelHandlers();
    setupKeyboardShortcuts();
});

/**
 * Setup control button handlers
 */
function setupControlHandlers() {
    // Reset view button
    const resetBtn = document.getElementById('resetBtn');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (graph) {
                graph.resetView();
            }
        });
    }

    // Fullscreen button
    const fullscreenBtn = document.getElementById('fullscreenBtn');
    if (fullscreenBtn) {
        fullscreenBtn.addEventListener('click', () => {
            const container = document.querySelector('.visualization-container');
            if (container && document.fullscreenElement === null) {
                container.requestFullscreen().catch(err => {
                    console.error('Fullscreen request failed:', err);
                });
            } else {
                document.exitFullscreen();
            }
        });
    }
}

/**
 * Setup side panel handlers
 */
function setupPanelHandlers() {
    // Close panel button
    const closeBtn = document.getElementById('closePanelBtn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            if (graph) {
                graph.deselectNode();
            }
        });
    }

    // Allow clicking panel header without closing
    const panelHeader = document.querySelector('.panel-header');
    if (panelHeader) {
        panelHeader.addEventListener('click', (event) => {
            event.stopPropagation();
        });
    }

    // Panel content scrolling should not affect graph
    const panelContent = document.getElementById('panelContent');
    if (panelContent) {
        panelContent.addEventListener('wheel', (event) => {
            event.stopPropagation();
        });
    }
}

/**
 * Setup keyboard shortcuts
 */
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (event) => {
        // Escape key: deselect node and close panel
        if (event.key === 'Escape') {
            if (graph && graph.selectedNode) {
                graph.deselectNode();
            }
        }

        // Ctrl/Cmd + S: Export (prevent default save)
        if ((event.ctrlKey || event.metaKey) && event.key === 's') {
            event.preventDefault();
            if (graph) {
                graph.exportSVG();
            }
        }

        // Ctrl/Cmd + F: Search (future feature)
        if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
            event.preventDefault();
            // TODO: Implement search functionality
            console.log('Search functionality coming soon');
        }

        // R key: Reset view
        if (event.key === 'r' && !event.ctrlKey && !event.metaKey) {
            if (graph) {
                graph.resetView();
            }
        }
    });
}

/**
 * Utility: Search for nodes
 */
async function searchNodes(query) {
    if (!query || query.length < 2) {
        return [];
    }

    try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await response.json();
        return data.results || [];
    } catch (error) {
        console.error('Search failed:', error);
        return [];
    }
}

/**
 * Utility: Highlight a specific node programmatically
 */
function highlightNode(nodeName) {
    if (!graph || !graph.graphData) return;

    const nodeData = graph.graphData.nodes.find(n => n.name === nodeName);
    if (nodeData) {
        // Find the corresponding element
        const nodeElement = document.querySelector(`[data-node-id="${nodeData.id}"]`);
        if (nodeElement) {
            // Trigger click to select it
            nodeElement.dispatchEvent(new MouseEvent('click', { bubbles: true }));

            // Scroll into view if in side panel
            setTimeout(() => {
                const panelContent = document.getElementById('panelContent');
                if (panelContent) {
                    panelContent.scrollTop = 0;
                }
            }, 300);
        }
    }
}

/**
 * Utility: Get statistics about the graph
 */
async function getGraphStatistics() {
    try {
        const response = await fetch('/api/stats');
        const stats = await response.json();
        return stats;
    } catch (error) {
        console.error('Failed to fetch statistics:', error);
        return null;
    }
}

/**
 * Utility: Print node information to console
 */
function printNodeInfo(nodeName) {
    if (!graph || !graph.graphData) {
        console.error('Graph not initialized');
        return;
    }

    const nodeData = graph.graphData.nodes.find(n => n.name === nodeName);
    if (!nodeData) {
        console.error(`Node "${nodeName}" not found`);
        return;
    }

    console.group(`📊 Node: ${nodeData.name}`);
    console.log('Category:', nodeData.category);
    console.log('Timeline Position:', nodeData.x_position);
    console.log('Year Mentions:', nodeData.year_mentions);
    console.log('Relationships:', nodeData.relationships_count);
    
    if (nodeData.predictions) {
        console.log('Predictions:', nodeData.predictions);
    }
    
    console.groupEnd();
}

/**
 * Advanced: Filter nodes by category
 */
function filterByCategory(category) {
    if (!graph || !graph.graphData) return;

    const validCategories = ['established', 'emerging', 'robotics'];
    if (!validCategories.includes(category)) {
        console.error(`Invalid category. Must be one of: ${validCategories.join(', ')}`);
        return;
    }

    // Hide/show nodes based on category
    graph.nodeElements.classed('hidden', d => d.category !== category);
    graph.linkElements.classed('hidden', link => {
        const sourceCategory = graph.graphData.nodes[link.source.id]?.category;
        const targetCategory = graph.graphData.nodes[link.target.id]?.category;
        return sourceCategory !== category || targetCategory !== category;
    });

    console.log(`Filtered to show only "${category}" category`);
}

/**
 * Advanced: Show all nodes (reset filter)
 */
function showAllNodes() {
    if (!graph) return;

    graph.nodeElements.classed('hidden', false);
    graph.linkElements.classed('hidden', false);

    console.log('All nodes visible');
}

/**
 * Advanced: Highlight multiple nodes
 */
function highlightMultiple(nodeNames) {
    if (!graph || !graph.graphData) return;

    const nodesToHighlight = new Set(nodeNames);

    graph.nodeElements.classed('path-node', d => nodesToHighlight.has(d.name));
    graph.nodeElements.classed('faded', d => !nodesToHighlight.has(d.name) && d.name !== graph.selectedNode?.name);

    console.log(`Highlighted ${nodeNames.length} nodes`);
}

/**
 * Advanced: Export node relationships as CSV
 */
function exportRelationships() {
    if (!graph || !graph.graphData) {
        console.error('Graph not initialized');
        return;
    }

    const csv = [
        ['Source', 'Target', 'Relation', 'Article'],
        ...graph.graphData.links.map(link => [
            graph.graphData.nodes[link.source]?.name || link.source,
            graph.graphData.nodes[link.target]?.name || link.target,
            link.relation,
            link.article
        ])
    ].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'robotics-relationships.csv';
    link.click();
}

/**
 * Advanced: Get all nodes of a specific type
 */
function getNodesByCategory(category) {
    if (!graph || !graph.graphData) {
        console.error('Graph not initialized');
        return [];
    }

    return graph.graphData.nodes.filter(n => n.category === category);
}

/**
 * Advanced: Find nodes by year
 */
function getNodesByYear(year) {
    if (!graph || !graph.graphData) {
        console.error('Graph not initialized');
        return [];
    }

    return graph.graphData.nodes.filter(n => 
        n.year_mentions && n.year_mentions.includes(year)
    );
}

/**
 * Advanced: Analyze graph complexity
 */
function analyzeGraphComplexity() {
    if (!graph || !graph.graphData) {
        console.error('Graph not initialized');
        return;
    }

    const nodes = graph.graphData.nodes;
    const links = graph.graphData.links;

    const avgConnections = (links.length * 2) / nodes.length;
    const density = (links.length) / (nodes.length * (nodes.length - 1));

    console.group('📈 Graph Complexity Analysis');
    console.log('Total Nodes:', nodes.length);
    console.log('Total Links:', links.length);
    console.log('Average Connections per Node:', avgConnections.toFixed(2));
    console.log('Graph Density:', (density * 100).toFixed(2) + '%');
    
    const categoryCount = {};
    nodes.forEach(n => {
        categoryCount[n.category] = (categoryCount[n.category] || 0) + 1;
    });
    console.log('Nodes by Category:', categoryCount);
    
    console.groupEnd();
}

/**
 * Setup developer console helpers
 */
window.GraphHelpers = {
    highlightNode,
    getGraphStatistics,
    printNodeInfo,
    searchNodes,
    filterByCategory,
    showAllNodes,
    highlightMultiple,
    exportRelationships,
    getNodesByCategory,
    getNodesByYear,
    analyzeGraphComplexity,
};

console.log('💡 Graph helpers available! Use GraphHelpers.* or window.graph to interact.');
console.log('Example: GraphHelpers.highlightNode("1X Technologies")');