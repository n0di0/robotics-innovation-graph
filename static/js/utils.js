/**
 * Robotics Innovation Graph - Utility Functions
 */

/**
 * Format a number as a readable string
 */
function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

/**
 * Debounce function to limit execution frequency
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Throttle function to limit execution frequency
 */
function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

/**
 * Deep clone an object
 */
function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Get dominant color of a category
 */
function getCategoryColor(category) {
    const colors = {
        'established': '#4a7c7e',
        'emerging': '#d4af37',
        'robotics': '#c9a961',
    };
    return colors[category] || '#7a7a7a';
}

/**
 * Format year array for display
 */
function formatYears(years) {
    if (!years || years.length === 0) return 'Unknown';
    if (years.length === 1) return `${years[0]}`;
    
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);
    
    if (minYear === maxYear) return `${minYear}`;
    return `${minYear} - ${maxYear}`;
}

/**
 * Truncate text with ellipsis
 */
function truncateText(text, maxLength = 50) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

/**
 * Escape HTML characters
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Parse timeline string to estimate year
 */
function parseTimelineYear(timelineStr) {
    if (!timelineStr) return null;
    
    const yearMatch = timelineStr.match(/(\d{4})/);
    if (yearMatch) {
        return parseInt(yearMatch[1]);
    }
    return null;
}

/**
 * Calculate Euclidean distance between two points
 */
function distance(p1, p2) {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Linear interpolation
 */
function lerp(a, b, t) {
    return a + (b - a) * t;
}

/**
 * Create a hierarchical structure from flat data
 */
function buildHierarchy(nodes, parentKey = 'parent') {
    const nodeMap = new Map();
    const roots = [];
    
    // Create map of all nodes
    nodes.forEach(node => {
        nodeMap.set(node.name, { ...node, children: [] });
    });
    
    // Build parent-child relationships
    nodes.forEach(node => {
        const nodeObj = nodeMap.get(node.name);
        if (node[parentKey]) {
            const parent = nodeMap.get(node[parentKey]);
            if (parent) {
                parent.children.push(nodeObj);
            } else {
                roots.push(nodeObj);
            }
        } else {
            roots.push(nodeObj);
        }
    });
    
    return roots;
}

/**
 * Find path between two nodes (BFS)
 */
function findPath(startNode, endNode, adjacencyList) {
    if (startNode === endNode) return [startNode];
    
    const visited = new Set([startNode]);
    const queue = [[startNode]];
    
    while (queue.length > 0) {
        const path = queue.shift();
        const current = path[path.length - 1];
        
        const neighbors = adjacencyList.get(current) || [];
        for (const neighbor of neighbors) {
            if (neighbor === endNode) {
                return [...path, neighbor];
            }
            
            if (!visited.has(neighbor)) {
                visited.add(neighbor);
                queue.push([...path, neighbor]);
            }
        }
    }
    
    return null; // No path found
}

/**
 * Format prediction data for display
 */
function formatPredictionData(predictions) {
    if (!predictions) return {};
    
    return {
        predecessors: predictions.predecessors || {},
        forward_trajectory: predictions.forward_trajectory || {},
        backward_analysis: predictions.backward_analysis || {},
    };
}

/**
 * Calculate node size based on relationships count
 */
function getNodeSize(relationshipsCount, minSize = 5, maxSize = 15) {
    // Normalize relationships count (0-500 range)
    const normalized = Math.min(relationshipsCount / 500, 1);
    return minSize + (normalized * (maxSize - minSize));
}

/**
 * Format timeline for display
 */
function formatTimeline(maturationTimeline) {
    if (!maturationTimeline) return '';
    
    // Extract years from strings like "2028-2034"
    const match = maturationTimeline.match(/(\d{4})/g);
    if (match) {
        return match.join(' - ');
    }
    return maturationTimeline;
}

/**
 * Create styled HTML for predictions panel
 */
function createPredictionHTML(node, paths) {
    let html = '';
    
    // Node metadata
    html += `<div class="panel-section">`;
    html += `<h3>Node Information</h3>`;
    html += `<div class="section-content">`;
    html += `<strong>Category:</strong> ${node.category.toUpperCase()}<br/>`;
    html += `<strong>Timeline:</strong> ${formatYears(node.year_mentions)}<br/>`;
    html += `<strong>Connections:</strong> ${node.relationships_count || 0}<br/>`;
    
    if (node.criticality_level) {
        html += `<strong>Criticality:</strong> <span class="tag ${node.criticality_level === 'high' ? 'critical' : ''}">${node.criticality_level.toUpperCase()}</span><br/>`;
    }
    
    if (node.priority_rank) {
        html += `<strong>Priority Rank:</strong> #${node.priority_rank}<br/>`;
    }
    
    html += `</div>`;
    html += `</div>`;
    
    // Predecessors
    const predecessors = node.predictions?.predecessors;
    if (predecessors && predecessors.direct_predecessors && predecessors.direct_predecessors.length > 0) {
        html += `<div class="panel-section">`;
        html += `<h3>Foundational Concepts</h3>`;
        html += `<div class="section-content">`;
        html += `<p>${truncateText(predecessors.enabling_technology || 'Foundation for this innovation', 100)}</p>`;
        html += `<strong>Key Predecessors:</strong>`;
        html += `<ul class="section-list">`;
        predecessors.direct_predecessors.slice(0, 5).forEach(pred => {
            html += `<li>${escapeHtml(pred)}</li>`;
        });
        html += `</ul>`;
        if (predecessors.timeline_origin) {
            html += `<p style="margin-top: 8px; font-size: 11px;"><em>Timeline Origin: ${predecessors.timeline_origin}</em></p>`;
        }
        html += `</div>`;
        html += `</div>`;
    }
    
    // Forward trajectory
    const forward = node.predictions?.forward_trajectory;
    if (forward && forward.emerging_applications && forward.emerging_applications.length > 0) {
        html += `<div class="panel-section">`;
        html += `<h3>Future Applications</h3>`;
        html += `<div class="section-content">`;
        html += `<strong>Emerging Applications:</strong>`;
        html += `<ul class="section-list">`;
        forward.emerging_applications.slice(0, 4).forEach(app => {
            html += `<li>${escapeHtml(truncateText(app, 70))}</li>`;
        });
        if (forward.emerging_applications.length > 4) {
            html += `<li>...and ${forward.emerging_applications.length - 4} more</li>`;
        }
        html += `</ul>`;
        
        if (forward.convergence_with && forward.convergence_with.length > 0) {
            html += `<strong style="display: block; margin-top: 10px;">Converges With:</strong>`;
            html += `<ul class="section-list">`;
            forward.convergence_with.slice(0, 3).forEach(conv => {
                html += `<li>${escapeHtml(truncateText(conv, 70))}</li>`;
            });
            html += `</ul>`;
        }
        
        if (forward.maturation_timeline) {
            html += `<p style="margin-top: 8px; font-size: 11px;"><em>Maturation Timeline: ${formatTimeline(forward.maturation_timeline)}</em></p>`;
        }
        
        html += `</div>`;
        html += `</div>`;
    }
    
    // Impact assessment
    const backward = node.predictions?.backward_analysis;
    if (backward && backward.problems_solved) {
        html += `<div class="panel-section">`;
        html += `<h3>Impact & Significance</h3>`;
        html += `<div class="section-content">`;
        html += `<p>${truncateText(backward.downstream_impact || 'Significant innovation in the field', 150)}</p>`;
        html += `</div>`;
        html += `</div>`;
    }
    
    // Pathway information
    if (paths && (paths.past.length > 0 || paths.future.length > 0)) {
        html += `<div class="panel-section">`;
        html += `<h3>Innovation Pathway</h3>`;
        html += `<div class="section-content">`;
        
        if (paths.past.length > 0) {
            html += `<strong>← Based On (${paths.past.length}):</strong>`;
            html += `<ul class="section-list">`;
            paths.past.slice(0, 3).forEach(node => {
                html += `<li>${escapeHtml(node)}</li>`;
            });
            if (paths.past.length > 3) {
                html += `<li>...and ${paths.past.length - 3} more</li>`;
            }
            html += `</ul>`;
        }
        
        if (paths.future.length > 0) {
            html += `<strong style="display: block; margin-top: 10px;">Leads To →  (${paths.future.length}):</strong>`;
            html += `<ul class="section-list">`;
            paths.future.slice(0, 3).forEach(node => {
                html += `<li>${escapeHtml(node)}</li>`;
            });
            if (paths.future.length > 3) {
                html += `<li>...and ${paths.future.length - 3} more</li>`;
            }
            html += `</ul>`;
        }
        
        html += `</div>`;
        html += `</div>`;
    }
    
    return html;
}

/**
 * Show tooltip with custom message
 */
function showTooltip(x, y, message) {
    const tooltip = document.getElementById('tooltip');
    if (!tooltip) return;
    
    tooltip.textContent = message;
    tooltip.classList.add('visible');
    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
}

/**
 * Hide tooltip
 */
function hideTooltip() {
    const tooltip = document.getElementById('tooltip');
    if (tooltip) {
        tooltip.classList.remove('visible');
    }
}

/**
 * Clamp value between min and max
 */
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

/**
 * Get contrasting text color for background
 */
function getContrastColor(bgColor) {
    // Convert hex to RGB
    const r = parseInt(bgColor.substr(1, 2), 16);
    const g = parseInt(bgColor.substr(3, 2), 16);
    const b = parseInt(bgColor.substr(5, 2), 16);
    
    // Calculate luminance
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    
    return luminance > 0.5 ? '#000000' : '#ffffff';
}