/**
 * Robotics Innovation Graph - D3 Visualization
 * Force-directed graph with temporal positioning
 */

class RoboticsGraph {
    constructor() {
        this.svg = null;
        this.graphData = null;
        this.simulation = null;
        this.selectedNode = null;
        this.highlightedNodes = new Set();
        this.highlightedLinks = new Set();
        this.width = window.innerWidth - 380; // Account for side panel
        this.height = window.innerHeight;
    }

    /**
     * Initialize the graph visualization
     */
    async init() {
        try {
            // Fetch graph data from backend
            const response = await fetch('/api/graph');
            this.graphData = await response.json();
            
            // Setup SVG
            this.setupSVG();
            
            // Create graph
            this.createGraph();
            
            // Setup interactions
            this.setupInteractions();
            
            // Hide loading indicator
            this.hideLoading();
            
            console.log('Graph initialized successfully');
        } catch (error) {
            console.error('Failed to initialize graph:', error);
            this.showError('Failed to load graph data');
        }
    }

    /**
     * Setup SVG element
     */
    setupSVG() {
        const container = document.getElementById('graph-svg').parentElement;
        this.width = container.clientWidth - 380;
        this.height = container.clientHeight;
        
        this.svg = d3.select('#graph-svg')
            .attr('viewBox', [0, 0, this.width, this.height])
            .attr('width', this.width)
            .attr('height', this.height);
    }

    /**
     * Create the D3 force-directed graph
     */
    createGraph() {
        const nodes = this.graphData.nodes.map(d => ({ ...d }));
        const links = this.graphData.links.map(d => ({ ...d }));

        // Create force simulation
        this.simulation = d3.forceSimulation(nodes)
            // Force based on relationships (links)
            .force('link', d3.forceLink(links)
                .id(d => d.id)
                .distance(d => 80)
                .strength(0.3)
            )
            // Repulsion between nodes
            .force('charge', d3.forceManyBody()
                .strength(-300)
                .distanceMax(500)
            )
            // Temporal X-axis positioning (older on left, newer on right)
            .force('x', d3.forceX()
                .x(d => (d.x_position / 100) * this.width)
                .strength(0.1)
            )
            // Y-axis for clustering
            .force('y', d3.forceY()
                .y(this.height / 2)
                .strength(0.05)
            )
            // Collision prevention
            .force('collide', d3.forceCollide()
                .radius(d => getNodeSize(d.relationships_count) + 8)
                .strength(0.5)
            );

        // Create container groups
        const container = this.svg.append('g').attr('class', 'graph-container');

        // Draw links
        const linkSelection = container.append('g')
            .attr('class', 'links')
            .selectAll('line')
            .data(links)
            .join('line')
            .attr('class', 'link')
            .attr('stroke-width', d => {
                // Thicker lines for important relationships
                return d.relation === 'builds_on' ? 2 : 1.5;
            });

        this.linkElements = linkSelection;

        // Draw nodes
        const nodeGroup = container.append('g')
            .attr('class', 'nodes')
            .selectAll('g')
            .data(nodes)
            .join('g')
            .attr('class', d => `node`)
            .attr('data-category', d => d.category)
            .attr('data-node-id', d => d.id)
            .call(this.drag(this.simulation));

        // Add circles to nodes
        nodeGroup.append('circle')
            .attr('r', d => getNodeSize(d.relationships_count))
            .attr('fill', d => getCategoryColor(d.category));

        // Add labels to nodes
        nodeGroup.append('text')
            .attr('class', 'node-label')
            .attr('dy', '.3em')
            .text(d => {
                // Abbreviate long names
                return d.name.length > 15 
                    ? d.name.substring(0, 12) + '...' 
                    : d.name;
            });

        this.nodeElements = nodeGroup;

        // Setup simulation tick
        this.simulation.on('tick', () => {
            linkSelection
                .attr('x1', d => d.source.x)
                .attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x)
                .attr('y2', d => d.target.y);

            nodeGroup
                .attr('transform', d => `translate(${d.x},${d.y})`);
        });

        // Add zoom behavior
        const zoom = d3.zoom()
            .on('zoom', (event) => {
                container.attr('transform', event.transform);
            });

        this.svg.call(zoom);

        // Reset zoom on double-click
        this.svg.on('dblclick.zoom', () => {
            this.svg.transition()
                .duration(750)
                .call(zoom.transform, d3.zoomIdentity.translate(0, 0));
        });

        // Add drag to grab canvas
        this.svg.on('mousedown', (event) => {
            if (event.target === this.svg.node()) {
                this.svg.classed('dragging', true);
            }
        }).on('mouseup', () => {
            this.svg.classed('dragging', false);
        });
    }

    /**
     * Create drag behavior for nodes
     */
    drag(simulation) {
        return d3.drag()
            .on('start', (event, d) => {
                if (!event.active) simulation.alphaTarget(0.3).restart();
                d.fx = d.x;
                d.fy = d.y;
            })
            .on('drag', (event, d) => {
                d.fx = event.x;
                d.fy = event.y;
            })
            .on('end', (event, d) => {
                if (!event.active) simulation.alphaTarget(0);
                d.fx = null;
                d.fy = null;
            });
    }

    /**
     * Setup event handlers for interactions
     */
    setupInteractions() {
        // Node click handler
        this.nodeElements.on('click', (event, d) => {
            event.stopPropagation();
            this.selectNode(d, event);
        });

        // Node hover handler
        this.nodeElements.on('mouseenter', (event, d) => {
            const message = `${d.name}\n${d.category.toUpperCase()}`;
            const rect = event.target.getBoundingClientRect();
            showTooltip(rect.right + 10, rect.top, message);
        }).on('mouseleave', () => {
            hideTooltip();
        });

        // Canvas click to deselect
        this.svg.on('click', () => {
            if (this.selectedNode) {
                this.deselectNode();
            }
        });

        // Window resize handler
        window.addEventListener('resize', () => this.handleResize());
    }

    /**
     * Select a node and show its information
     */
    async selectNode(nodeData, event) {
        // Deselect previous node
        if (this.selectedNode) {
            this.deselectNode();
        }

        this.selectedNode = nodeData;

        // Update visual state
        this.nodeElements.classed('selected', d => d.id === nodeData.id);
        this.nodeElements.classed('faded', d => d.id !== nodeData.id);
        this.linkElements.classed('faded', true);

        // Fetch paths data
        try {
            const response = await fetch(`/api/node/${encodeURIComponent(nodeData.name)}`);
            const data = await response.json();

            // Highlight paths
            this.highlightPaths(data.paths);

            // Show side panel
            this.showNodePanel(nodeData, data);
        } catch (error) {
            console.error('Failed to fetch node data:', error);
        }
    }

    /**
     * Deselect current node
     */
    deselectNode() {
        this.selectedNode = null;
        this.highlightedNodes.clear();
        this.highlightedLinks.clear();

        // Reset visual state
        this.nodeElements.classed('selected', false);
        this.nodeElements.classed('faded', false);
        this.nodeElements.classed('path-node', false);
        this.linkElements.classed('faded', false);
        this.linkElements.classed('highlighted', false);

        // Hide side panel
        this.hidNodePanel();
    }

    /**
     * Highlight paths from selected node
     */
    highlightPaths(paths) {
        if (!paths) return;

        // Add nodes to highlighted set
        if (paths.past) {
            paths.past.forEach(name => {
                const node = this.graphData.nodes.find(n => n.name === name);
                if (node) this.highlightedNodes.add(node.id);
            });
        }

        if (paths.future) {
            paths.future.forEach(name => {
                const node = this.graphData.nodes.find(n => n.name === name);
                if (node) this.highlightedNodes.add(node.id);
            });
        }

        // Update node styles
        this.nodeElements
            .classed('path-node', d => this.highlightedNodes.has(d.id))
            .classed('faded', d => 
                d.id !== this.selectedNode.id && 
                !this.highlightedNodes.has(d.id)
            );

        // Highlight links between highlighted nodes
        this.linkElements
            .classed('highlighted', link => {
                const sourceHighlighted = this.highlightedNodes.has(link.source.id);
                const targetHighlighted = this.highlightedNodes.has(link.target.id);
                const sourceSelected = link.source.id === this.selectedNode.id;
                const targetSelected = link.target.id === this.selectedNode.id;

                return (sourceHighlighted || targetHighlighted) &&
                       (sourceSelected || targetSelected);
            })
            .classed('faded', link => {
                const sourceHighlighted = this.highlightedNodes.has(link.source.id);
                const targetHighlighted = this.highlightedNodes.has(link.target.id);
                const sourceSelected = link.source.id === this.selectedNode.id;
                const targetSelected = link.target.id === this.selectedNode.id;

                return !((sourceHighlighted || targetHighlighted) &&
                         (sourceSelected || targetSelected));
            });
    }

    /**
     * Show information panel for selected node
     */
    showNodePanel(nodeData, apiData) {
        const panel = document.getElementById('sidePanel');
        const nodeNameElem = document.getElementById('nodeName');
        const panelContent = document.getElementById('panelContent');

        // Update header
        nodeNameElem.textContent = nodeData.name;

        // Build panel content
        const html = createPredictionHTML(nodeData, apiData.paths);
        panelContent.innerHTML = html;

        // Open panel
        panel.classList.add('open');
    }

    /**
     * Hide information panel
     */
    hidNodePanel() {
        const panel = document.getElementById('sidePanel');
        panel.classList.remove('open');
    }

    /**
     * Handle window resize
     */
    handleResize() {
        this.width = window.innerWidth - 380;
        this.height = window.innerHeight;

        this.svg
            .attr('width', this.width)
            .attr('height', this.height)
            .attr('viewBox', [0, 0, this.width, this.height]);

        // Update forces
        if (this.simulation) {
            this.simulation
                .force('x', d3.forceX()
                    .x(d => (d.x_position / 100) * this.width)
                    .strength(0.1)
                )
                .force('y', d3.forceY()
                    .y(this.height / 2)
                    .strength(0.05)
                )
                .alpha(0.3)
                .restart();
        }
    }

    /**
     * Show loading indicator
     */
    showLoading() {
        const loader = document.getElementById('loadingIndicator');
        if (loader) loader.classList.remove('hidden');
    }

    /**
     * Hide loading indicator
     */
    hideLoading() {
        const loader = document.getElementById('loadingIndicator');
        if (loader) loader.classList.add('hidden');
    }

    /**
     * Show error message
     */
    showError(message) {
        const loader = document.getElementById('loadingIndicator');
        if (loader) {
            loader.querySelector('p').textContent = message;
        }
    }

    /**
     * Reset zoom and pan
     */
    resetView() {
        this.svg.transition()
            .duration(750)
            .call(
                d3.zoom().transform,
                d3.zoomIdentity.translate(0, 0)
            );

        if (this.simulation) {
            this.simulation.alpha(0.3).restart();
        }
    }

    /**
     * Export graph as SVG
     */
    exportSVG() {
        const svgString = new XMLSerializer().serializeToString(this.svg.node());
        const blob = new Blob([svgString], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'robotics-graph.svg';
        link.click();
    }
}

// Initialize graph when page loads
let graph;
document.addEventListener('DOMContentLoaded', () => {
    graph = new RoboticsGraph();
    graph.init();
});