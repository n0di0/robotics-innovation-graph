#!/usr/bin/env python3
"""
Robotics Innovation Graph - Flask Backend
Processes knowledge graph and serves interactive visualization
"""

import json
import math
from flask import Flask, render_template, jsonify, request
from collections import defaultdict
from pathlib import Path

app = Flask(__name__, static_folder='static', template_folder='templates')

# Load data
DATA_PATH = Path('data.json')
with open(DATA_PATH, 'r') as f:
    KNOWLEDGE_BASE = json.load(f)

# Cache for processed graph
GRAPH_CACHE = None


def categorize_node(article_data):
    """Determine node category based on predictions and timeline."""
    predictions = article_data.get('predictions', {})
    year_mentions = article_data.get('year_mentions', [])
    
    # Check if it's marked as core robotics
    if article_data.get('title', '').lower() in ['robotics', 'robot', 'automation']:
        return 'robotics'
    
    # Check if it's an emerging technology
    if predictions.get('is_curated_forecast_priority'):
        return 'emerging'
    
    # Check if recent mentions (2024+)
    if year_mentions and max(year_mentions) >= 2024:
        return 'emerging'
    
    # Default to established
    return 'established'


def estimate_timeline_position(article_data):
    """Estimate X position based on timeline (older=left, newer=right)."""
    year_mentions = article_data.get('year_mentions', [])
    predictions = article_data.get('predictions', {})
    
    if not year_mentions:
        return 50  # Default middle position
    
    min_year = min(year_mentions)
    max_year = max(year_mentions)
    
    # Normalize between 0-100 based on full timeline
    # Assuming robotics timeline: 1920-2036
    timeline_start = 1920
    timeline_end = 2036
    
    # Use average year position
    avg_year = (min_year + max_year) / 2
    position = ((avg_year - timeline_start) / (timeline_end - timeline_start)) * 100
    
    # Future predictions push toward right
    if predictions.get('forward_trajectory'):
        maturation = predictions['forward_trajectory'].get('maturation_timeline', '')
        if '202' in maturation:  # Future date
            position = min(position + 10, 100)
    
    return max(0, min(100, position))


def build_graph():
    """Process knowledge base into graph-ready format."""
    global GRAPH_CACHE
    
    if GRAPH_CACHE:
        return GRAPH_CACHE
    
    nodes = []
    links = []
    node_map = {}
    
    articles = KNOWLEDGE_BASE.get('articles', {})
    relationships = KNOWLEDGE_BASE.get('relationships', [])
    predictions_index = KNOWLEDGE_BASE.get('predictions_index', {})
    
    # Create nodes
    for idx, (title, article_data) in enumerate(articles.items()):
        category = categorize_node(article_data)
        x_position = estimate_timeline_position(article_data)
        
        predictions = predictions_index.get(title, {})
        
        node = {
            'id': idx,
            'name': title,
            'category': category,
            'description': article_data.get('categories', [''])[0] if article_data.get('categories') else '',
            'x_position': x_position,
            'year_mentions': article_data.get('year_mentions', []),
            'relationships_count': article_data.get('relationships', 0),
            'predictions': {
                'predecessors': predictions.get('predecessors', {}),
                'forward_trajectory': predictions.get('forward_trajectory', {}),
                'backward_analysis': predictions.get('backward_analysis', {}),
            },
            'priority_rank': predictions.get('priority_rank'),
            'criticality_level': predictions.get('backward_analysis', {}).get('criticality_level', 'medium'),
        }
        
        nodes.append(node)
        node_map[title] = idx
    
    # Create links from relationships
    seen_links = set()
    
    for rel in relationships[:500]:  # Limit relationships for performance
        source_title = rel.get('source', '').title()
        target_title = rel.get('target', '').title()
        
        # Try to find matches in our node map
        source_id = None
        target_id = None
        
        # Direct match
        if source_title in node_map:
            source_id = node_map[source_title]
        else:
            # Fuzzy match - find article starting with source
            for title, idx in node_map.items():
                if source_title.lower() in title.lower():
                    source_id = idx
                    break
        
        if target_title in node_map:
            target_id = node_map[target_title]
        else:
            for title, idx in node_map.items():
                if target_title.lower() in title.lower():
                    target_id = idx
                    break
        
        if source_id is not None and target_id is not None:
            link_key = (min(source_id, target_id), max(source_id, target_id))
            if link_key not in seen_links:
                links.append({
                    'source': source_id,
                    'target': target_id,
                    'relation': rel.get('relation', 'connects'),
                    'article': rel.get('article', ''),
                })
                seen_links.add(link_key)
    
    # Add prediction-based links (predecessors and forward trajectory)
    for title, predictions in predictions_index.items():
        if title not in node_map:
            continue
        
        source_id = node_map[title]
        
        # Add links to predecessors
        predecessors = predictions.get('predecessors', {}).get('direct_predecessors', [])
        for pred_title in predecessors:
            if pred_title in node_map:
                target_id = node_map[pred_title]
                link_key = (min(source_id, target_id), max(source_id, target_id))
                if link_key not in seen_links:
                    links.append({
                        'source': source_id,
                        'target': target_id,
                        'relation': 'builds_on',
                        'article': title,
                    })
                    seen_links.add(link_key)
    
    GRAPH_CACHE = {
        'nodes': nodes,
        'links': links,
        'metadata': KNOWLEDGE_BASE.get('metadata', {}),
    }
    
    return GRAPH_CACHE


def find_paths(node_name, graph_data):
    """Find paths backward (predecessors) and forward (successors) from a node."""
    nodes = {n['name']: n for n in graph_data['nodes']}
    links = graph_data['links']
    
    if node_name not in nodes:
        return {'past': [], 'future': []}
    
    node = nodes[node_name]
    
    # Build adjacency list
    forward_map = defaultdict(list)  # target -> sources
    backward_map = defaultdict(list)  # source -> targets
    
    for link in links:
        source_name = graph_data['nodes'][link['source']]['name']
        target_name = graph_data['nodes'][link['target']]['name']
        
        backward_map[source_name].append(target_name)
        forward_map[target_name].append(source_name)
    
    # BFS for past (predecessors)
    past = []
    visited = set([node_name])
    queue = [(name, 1) for name in forward_map[node_name]]
    
    while queue:
        current, depth = queue.pop(0)
        if current not in visited and depth <= 3:
            visited.add(current)
            past.append(current)
            queue.extend([(name, depth + 1) for name in forward_map[current]])
    
    # BFS for future (successors)
    future = []
    visited = set([node_name])
    queue = [(name, 1) for name in backward_map[node_name]]
    
    while queue:
        current, depth = queue.pop(0)
        if current not in visited and depth <= 3:
            visited.add(current)
            future.append(current)
            queue.extend([(name, depth + 1) for name in backward_map[current]])
    
    return {
        'past': past,
        'future': future,
        'node': node_name,
    }


@app.route('/')
def index():
    """Serve main page."""
    return render_template('index.html')


@app.route('/api/graph')
def api_graph():
    """Return processed graph data."""
    graph_data = build_graph()
    return jsonify(graph_data)


@app.route('/api/node/<node_name>')
def api_node(node_name):
    """Return detailed information about a specific node."""
    graph_data = build_graph()
    
    node_data = next((n for n in graph_data['nodes'] if n['name'] == node_name), None)
    if not node_data:
        return jsonify({'error': 'Node not found'}), 404
    
    # Get paths
    paths = find_paths(node_name, graph_data)
    
    return jsonify({
        'node': node_data,
        'paths': paths,
    })


@app.route('/api/search')
def api_search():
    """Search for nodes by name."""
    query = request.args.get('q', '').lower()
    graph_data = build_graph()
    
    results = [
        n for n in graph_data['nodes']
        if query in n['name'].lower()
    ][:10]
    
    return jsonify({'results': results})


@app.route('/api/stats')
def api_stats():
    """Return graph statistics."""
    graph_data = build_graph()
    
    categories = defaultdict(int)
    for node in graph_data['nodes']:
        categories[node['category']] += 1
    
    return jsonify({
        'total_nodes': len(graph_data['nodes']),
        'total_links': len(graph_data['links']),
        'categories': dict(categories),
        'timeline_span': '1920-2036',
    })


if __name__ == '__main__':
    # Build graph on startup
    print("Building graph...")
    build_graph()
    print("Graph built successfully!")
    
    # Run Flask app
    app.run(debug=True, host='0.0.0.0', port=5000)