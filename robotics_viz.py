#!/usr/bin/env python3
"""
Robotics Knowledge Atlas — Interactive Graph Visualization
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
pip install dash dash-cytoscape
python robotics_viz.py          →   http://127.0.0.1:8050
"""

import json, random, textwrap
from collections import defaultdict

import dash
from dash import dcc, html, Input, Output, State
from dash.exceptions import PreventUpdate
import dash_cytoscape as cyto

cyto.load_extra_layouts()
random.seed(42)

# ── 1. LOAD & PARSE DATA ──────────────────────────────────────────────────────

with open("robotics_knowledge_base_with_predictions.json") as f:
    RAW = json.load(f)

ARTS   = RAW["articles"]
KEYSET = set(ARTS.keys())
YEAR_NOW = 2026


def categorize(art):
    text = " ".join(art.get("categories") or []).lower() + " " + (art.get("title") or "").lower()
    if "robot" in text:                                                      return "Core Robotics"
    if any(k in text for k in ["artificial intelligence", "machine learning", "deep learning", "neural"]):
                                                                             return "AI & Learning"
    if any(k in text for k in ["control system", "automation", "actuator", "servo", "pid"]):
                                                                             return "Control Systems"
    if any(k in text for k in ["sensor", "vision", "perception", "lidar", "camera", "image"]):
                                                                             return "Sensing & Perception"
    if any(k in text for k in ["manufactur", "industrial", "factory", "assembly", "welding"]):
                                                                             return "Manufacturing"
    if any(k in text for k in ["material", "engineer", "polymer", "alloy", "composite", "mechanical"]):
                                                                             return "Materials & Engineering"
    return "Other"


# Build node metadata dict
nodes_info  = {}
children    = defaultdict(list)   # parent_id → [child_ids]
parent_of   = {}                  # child_id  → parent_id

for key, art in ARTS.items():
    ym   = art.get("year_mentions") or []
    year = ym[-1] if ym else None
    cat  = categorize(art)
    par  = art.get("parent") if art.get("parent") in KEYSET else None
    pred = art.get("predictions") or {}
    fwd  = pred.get("forward_trajectory") or {}
    bwd  = pred.get("backward_analysis") or {}
    preds_struct = pred.get("predecessors") or {}

    nodes_info[key] = dict(
        id           = key,
        label        = art.get("title", key),
        category     = cat,
        year         = year,
        parent_id    = par,
        rel_count    = art.get("relationships", 0),
        links_found  = art.get("links_found", 0),
        text_length  = art.get("text_length", 0),
        depth        = art.get("depth", 0),
        criticality  = bwd.get("criticality_level", "medium"),
        impact       = fwd.get("future_impact", "") or "",
        maturation   = fwd.get("maturation_timeline", "") or "",
        apps         = (fwd.get("emerging_applications") or [])[:4],
        convergence  = (fwd.get("convergence_with") or [])[:4],
        problems     = (bwd.get("problems_solved") or [])[:3],
        downstream   = bwd.get("downstream_impact", "") or "",
        direct_preds = (preds_struct.get("direct_predecessors") or [])[:4],
        is_emerging  = bool(year and year > YEAR_NOW),
        is_priority  = bool(pred.get("is_curated_forecast_priority")),
    )

    if par:
        children[par].append(key)
        parent_of[key] = par


# ── 2. GRAPH TRAVERSAL ────────────────────────────────────────────────────────

def get_ancestors(nid):
    result, curr = set(), nid
    while parent_of.get(curr):
        curr = parent_of[curr]
        result.add(curr)
    return result

def get_descendants(nid):
    result, queue = set(), list(children.get(nid, []))
    while queue:
        c = queue.pop()
        if c not in result:
            result.add(c)
            queue.extend(children.get(c, []))
    return result


# ── 3. POSITIONS ──────────────────────────────────────────────────────────────

XMIN, XMAX   = 1950, 2065
PX_MIN, PX_MAX = 120, 2700
UNDATED_X    = PX_MAX + 200

def year_to_px(y):
    if y is None:
        return UNDATED_X
    return PX_MIN + (max(XMIN, min(XMAX, y)) - XMIN) / (XMAX - XMIN) * (PX_MAX - PX_MIN)

# Y-band centres per category — tighter spacing so the view fits on screen
CAT_CENTERS = {
    "Core Robotics":            0,
    "AI & Learning":          -310,
    "Control Systems":        -620,
    "Sensing & Perception":   -930,
    "Manufacturing":           310,
    "Materials & Engineering": 620,
    "Other":                   990,
}

positions = {}
for cat, center in CAT_CENTERS.items():
    keys = sorted(
        [k for k, n in nodes_info.items() if n["category"] == cat],
        key=lambda k: nodes_info[k]["year"] or 9999,
    )
    n = len(keys)
    # Cap spread so even the large "Other" bucket stays readable
    spread = min(max(260, n * 22), 680)
    for i, key in enumerate(keys):
        frac = i / max(n - 1, 1)
        positions[key] = {
            "x": year_to_px(nodes_info[key]["year"]),
            "y": center - spread / 2 + frac * spread + random.uniform(-18, 18),
        }


# ── 4. CYTOSCAPE ELEMENTS ─────────────────────────────────────────────────────

def build_elements(selected_id=None):
    anc = desc = set()
    anc_edges  = set()
    desc_edges = set()

    if selected_id:
        anc  = get_ancestors(selected_id)
        desc = get_descendants(selected_id)
        # Collect ancestor edge pairs
        curr = selected_id
        while parent_of.get(curr):
            p = parent_of[curr]
            anc_edges.add((p, curr))
            curr = p
        # Collect descendant edge pairs
        q = [selected_id]
        while q:
            n = q.pop()
            for c in children.get(n, []):
                desc_edges.add((n, c))
                q.append(c)

    elements = []

    # Nodes
    for key, ni in nodes_info.items():
        # Base type
        if ni["is_emerging"]:
            ntype = "emerging"
        elif ni["category"] == "Core Robotics":
            ntype = "robotics"
        else:
            ntype = "default"

        # Highlight state
        if selected_id:
            if key == selected_id:   state = "selected"
            elif key in anc:         state = "ancestor"
            elif key in desc:        state = "descendant"
            else:                    state = "dimmed"
        else:
            state = ""

        # Short description for tooltip (embedded in node data)
        desc_short = (ni["impact"][:140] + "…") if len(ni["impact"]) > 140 else ni["impact"]
        if not desc_short:
            desc_short = f"{ni['category']} · {'emerging' if ni['is_emerging'] else 'established'}"

        elements.append({
            "data": {
                "id":          key,
                "label":       ni["label"],
                "category":    ni["category"],
                "year":        ni["year"] or "undated",
                "is_emerging": ni["is_emerging"],
                "rel_count":   ni["rel_count"],
                "desc":        desc_short,
                "crit":        ni["criticality"],
            },
            "position": positions[key],
            "classes": f"{ntype} {state}".strip(),
        })

    # Edges (parent → child tree)
    for key, ni in nodes_info.items():
        if not ni["parent_id"]:
            continue
        s, t = ni["parent_id"], key

        if selected_id:
            if   (s, t) in anc_edges:  ecls = "anc-edge"
            elif (s, t) in desc_edges: ecls = "desc-edge"
            else:                      ecls = "edge-dimmed"
        else:
            ecls = ""

        elements.append({
            "data": {"id": f"e_{s}_{t}", "source": s, "target": t},
            "classes": ecls,
        })

    return elements


# ── 5. CYTOSCAPE STYLESHEET ───────────────────────────────────────────────────

STYLESHEET = [
    # ── Base node
    {
        "selector": "node",
        "style": {
            "width":  "mapData(rel_count, 0, 100, 14, 52)",
            "height": "mapData(rel_count, 0, 100, 14, 52)",
            "background-color":    "#3e4552",
            "border-color":        "#1e2128",
            "border-width":        1.5,
            "label":               "data(label)",
            "font-size":           "8px",
            "font-family":         "IBM Plex Mono, ui-monospace, monospace",
            "color":               "#6a7488",
            "text-valign":         "bottom",
            "text-halign":         "center",
            "text-margin-y":       4,
            "text-max-width":      "80px",
            "text-wrap":           "ellipsis",
            "min-zoomed-font-size": 7,
            "z-index":             1,
        },
    },
    # Node types
    {"selector": "node.default",  "style": {"background-color": "#3e4552", "border-color": "#1e2128"}},
    {"selector": "node.robotics", "style": {
        "background-color": "#8fa4b8",
        "border-color":     "#b0c4d4",
        "border-width":     2,
        "color":            "#8fa4b8",
    }},
    {"selector": "node.emerging", "style": {
        "background-color": "#c8a030",
        "border-color":     "#e0be60",
        "border-width":     2,
        "color":            "#c8a030",
        "shape":            "diamond",
    }},
    # Highlight states
    {"selector": "node.selected", "style": {
        "background-color": "#ffffff",
        "border-color":     "#ffffff",
        "border-width":     3,
        "color":            "#ffffff",
        "font-size":        "9px",
        "z-index":          20,
    }},
    {"selector": "node.ancestor", "style": {
        "background-color": "#7a9ab8",
        "border-color":     "#9ab8d0",
        "border-width":     2.5,
        "color":            "#9ab8d0",
        "z-index":          10,
    }},
    {"selector": "node.descendant", "style": {
        "background-color": "#c8a030",
        "border-color":     "#e0be60",
        "border-width":     2.5,
        "color":            "#d4b040",
        "z-index":          10,
    }},
    {"selector": "node.dimmed", "style": {"opacity": 0.10, "z-index": 0}},

    # ── Edges
    {
        "selector": "edge",
        "style": {
            "line-color":          "#1e2530",
            "width":               1,
            "curve-style":         "bezier",
            "target-arrow-shape":  "triangle",
            "target-arrow-color":  "#1e2530",
            "arrow-scale":         0.65,
            "opacity":             0.55,
            "z-index":             1,
        },
    },
    {"selector": "edge.anc-edge", "style": {
        "line-color":         "#5a7a9a",
        "target-arrow-color": "#5a7a9a",
        "width":              2.2,
        "opacity":            1,
        "z-index":            8,
    }},
    {"selector": "edge.desc-edge", "style": {
        "line-color":         "#c8a030",
        "target-arrow-color": "#c8a030",
        "width":              2.2,
        "opacity":            1,
        "z-index":            8,
    }},
    {"selector": "edge.edge-dimmed", "style": {"opacity": 0.04, "z-index": 0}},
]


# ── 6. LAYOUT ─────────────────────────────────────────────────────────────────

CAT_META = {
    "Core Robotics":            {"color": "#8fa4b8", "shape": "●"},
    "AI & Learning":            {"color": "#9b8fc8", "shape": "●"},
    "Control Systems":          {"color": "#6a9a80", "shape": "●"},
    "Sensing & Perception":     {"color": "#b08878", "shape": "●"},
    "Manufacturing":            {"color": "#8a9860", "shape": "●"},
    "Materials & Engineering":  {"color": "#787888", "shape": "●"},
    "Other":                    {"color": "#4a5060", "shape": "●"},
    "Emerging (>2026)":         {"color": "#c8a030", "shape": "◆"},
}

CAT_COUNTS = defaultdict(int)
for ni in nodes_info.values():
    CAT_COUNTS[ni["category"]] += 1
EMERGING_COUNT = sum(1 for ni in nodes_info.values() if ni["is_emerging"])


def legend_row(cat, color, shape, count):
    return html.Div([
        html.Span(shape, style={"color": color, "font-size": "11px", "margin-right": "8px",
                                 "line-height": "1"}),
        html.Span(cat,   style={"flex": "1", "font-size": "11px", "color": "#8090a0"}),
        html.Span(str(count), style={"font-size": "10px", "color": "#4a5a6a",
                                      "font-family": "IBM Plex Mono, monospace"}),
    ], style={"display": "flex", "align-items": "center", "padding": "4px 0",
               "gap": "2px"})


def build_panel_content(node_id):
    ni = nodes_info.get(node_id)
    if not ni:
        return html.Div()

    cat_color = CAT_META.get(ni["category"], {}).get("color", "#8090a0")
    crit_colors = {"high": "#e07060", "medium": "#c8a030", "low": "#70a870"}
    crit_c = crit_colors.get((ni["criticality"] or "medium").lower(), "#c8a030")

    parts = [
        # Category eyebrow
        html.Div([
            html.Span("●", style={"color": cat_color, "margin-right": "6px"}),
            html.Span(ni["category"].upper(), style={"font-size": "10px", "letter-spacing": "0.14em",
                                                       "color": cat_color}),
        ], style={"margin-bottom": "8px", "display": "flex", "align-items": "center"}),
        # Title
        html.H2(ni["label"], style={"font-size": "20px", "font-weight": "600",
                                     "color": "#e8e8ea", "margin-bottom": "18px",
                                     "line-height": "1.25", "letter-spacing": "-0.01em"}),
        # Stats grid
        html.Div([
            stat_cell("YEAR",          str(ni["year"]) if ni["year"] else "—"),
            stat_cell("CRITICALITY",   (ni["criticality"] or "medium").upper(), color=crit_c),
            stat_cell("RELATIONSHIPS", str(ni["rel_count"])),
            stat_cell("LINKS FOUND",   str(ni["links_found"])),
            stat_cell("DEPTH",         str(ni["depth"])),
            stat_cell("TEXT",          f"{ni['text_length']//1000}k chars"),
        ], style={"display": "grid", "grid-template-columns": "1fr 1fr",
                   "gap": "1px", "background": "#1e2230", "border": "1px solid #1e2230",
                   "border-radius": "6px", "overflow": "hidden", "margin-bottom": "20px"}),
    ]

    if ni["maturation"]:
        parts.append(section("MATURATION WINDOW",
            html.Div(ni["maturation"], style={"font-family": "IBM Plex Mono, monospace",
                                               "font-size": "16px", "color": "#c8a030",
                                               "letter-spacing": "0.04em"})))
    if ni["impact"]:
        parts.append(section("PROJECTED IMPACT",
            html.P(ni["impact"], style={"font-size": "12.5px", "line-height": "1.6",
                                         "color": "#8090a0", "margin": 0})))
    if ni["apps"]:
        parts.append(section("EMERGING APPLICATIONS",
            html.Ul([html.Li(a, style={"font-size": "12px", "color": "#8090a0",
                                        "margin-bottom": "5px", "line-height": "1.5"})
                     for a in ni["apps"]],
                    style={"padding-left": "16px", "margin": 0})))
    if ni["convergence"]:
        parts.append(section("CONVERGENCE WITH", chips(ni["convergence"], "#2a3445", "#6a8aaa")))

    if ni["problems"]:
        parts.append(section("PROBLEMS SOLVED",
            html.Ul([html.Li(p, style={"font-size": "12px", "color": "#8090a0",
                                        "margin-bottom": "5px", "line-height": "1.5"})
                     for p in ni["problems"]],
                    style={"padding-left": "16px", "margin": 0})))
    if ni["direct_preds"]:
        parts.append(section("DIRECT PREDECESSORS", chips(ni["direct_preds"], "#2a2a3a", "#7070a0")))

    if ni["downstream"]:
        parts.append(section("DOWNSTREAM IMPACT",
            html.P(ni["downstream"][:320] + ("…" if len(ni["downstream"]) > 320 else ""),
                   style={"font-size": "12px", "line-height": "1.55", "color": "#6a7a8a", "margin": 0})))

    parent_id = ni["parent_id"]
    if parent_id and parent_id in nodes_info:
        par_ni = nodes_info[parent_id]
        parts.append(section("DERIVES FROM",
            html.Div(par_ni["label"],
                     style={"font-size": "12px", "color": "#8090a0", "padding": "6px 10px",
                             "background": "#1e2230", "border": "1px solid #2a3445",
                             "border-radius": "6px", "display": "inline-block"})))

    return html.Div(parts)


def stat_cell(label, value, color="#e8e8ea"):
    return html.Div([
        html.Div(label, style={"font-family": "IBM Plex Mono, monospace", "font-size": "9px",
                                "letter-spacing": "0.1em", "color": "#4a5a6a",
                                "margin-bottom": "3px", "text-transform": "uppercase"}),
        html.Div(value, style={"font-family": "IBM Plex Mono, monospace", "font-size": "15px",
                                "font-weight": "600", "color": color}),
    ], style={"background": "#0f1118", "padding": "10px 12px"})


def section(title, content):
    return html.Div([
        html.H5(title, style={"font-family": "IBM Plex Mono, monospace", "font-size": "9.5px",
                               "letter-spacing": "0.12em", "color": "#3a4a5a",
                               "margin-bottom": "8px", "text-transform": "uppercase",
                               "font-weight": "600"}),
        content,
    ], style={"margin-bottom": "18px"})


def chips(items, bg, color):
    return html.Div([
        html.Span(item, style={"font-size": "11px", "padding": "4px 9px", "border-radius": "5px",
                                "background": bg, "color": color, "margin": "2px",
                                "display": "inline-block", "line-height": "1.4"})
        for item in items
    ])


# ── 7. DASH APP ───────────────────────────────────────────────────────────────

app = dash.Dash(__name__, title="Robotics Knowledge Atlas")

# Inject global mouse tracker into <body> tag
app.index_string = app.index_string.replace(
    "<body>",
    '<body onmousemove="window.__mx=event.clientX;window.__my=event.clientY;">'
)

total_nodes = len(nodes_info)
emerging_n  = sum(1 for n in nodes_info.values() if n["is_emerging"])

app.layout = html.Div([

    # ── Hidden stores
    dcc.Store(id="selected-store", data=None),

    # ── Header
    html.Div([
        html.Div([
            html.Span("ROBOTICS", style={"color": "#c8a030", "font-weight": "700"}),
            html.Span(" KNOWLEDGE ATLAS", style={"color": "#e8e8ea", "font-weight": "600"}),
        ], style={"font-family": "IBM Plex Mono, monospace", "font-size": "14px",
                   "letter-spacing": "0.14em"}),
        html.Div([
            html.Span(f"{total_nodes} articles",
                      style={"color": "#4a5a6a", "font-family": "IBM Plex Mono, monospace",
                              "font-size": "11px"}),
            html.Span("  ·  ", style={"color": "#2a3040"}),
            html.Span(f"{emerging_n} emerging",
                      style={"color": "#c8a030", "font-family": "IBM Plex Mono, monospace",
                              "font-size": "11px"}),
        ], style={"margin-left": "auto", "display": "flex", "align-items": "center"}),
    ], style={
        "position": "fixed", "top": 0, "left": 0, "right": 0, "z-index": "200",
        "background": "rgba(10,10,11,0.96)", "border-bottom": "1px solid #1a1e28",
        "padding": "14px 24px", "display": "flex", "align-items": "center",
        "backdrop-filter": "blur(8px)",
    }),

    # ── Left legend
    html.Div([
        html.Div("CATEGORIES", style={"font-family": "IBM Plex Mono, monospace", "font-size": "9.5px",
                                       "letter-spacing": "0.14em", "color": "#3a4a5a",
                                       "font-weight": "600", "margin-bottom": "10px",
                                       "padding-bottom": "8px", "border-bottom": "1px solid #1a2030"}),
        *[legend_row(cat, CAT_META[cat]["color"], CAT_META[cat]["shape"], CAT_COUNTS[cat])
          for cat in CAT_CENTERS if CAT_COUNTS[cat] > 0],
        html.Div(style={"border-top": "1px solid #1a2030", "margin": "10px 0"}),
        legend_row("Emerging (>2026)", "#c8a030", "◆", EMERGING_COUNT),
        html.Div([
            html.Div("NODE SIZE = relationship count", style={"margin-bottom": "4px"}),
            html.Div("EDGE → parent derivation"),
            html.Div(style={"border-top": "1px solid #1a2030", "margin": "8px 0"}),
            html.Div([html.Span("──", style={"color": "#5a7a9a", "margin-right": "6px"}),
                      html.Span("ancestor path")], style={"margin-bottom": "3px"}),
            html.Div([html.Span("──", style={"color": "#c8a030", "margin-right": "6px"}),
                      html.Span("descendant path")]),
        ], style={"margin-top": "10px", "padding-top": "10px", "border-top": "1px solid #1a2030",
                   "font-size": "9.5px", "color": "#3a4a5a", "line-height": "1.7",
                   "font-family": "IBM Plex Mono, monospace"}),
    ], style={
        "position": "fixed", "top": "52px", "left": "16px", "z-index": "100",
        "background": "#0f1118", "border": "1px solid #1a2030", "border-radius": "8px",
        "padding": "14px 14px 12px", "width": "208px",
        "box-shadow": "0 8px 32px rgba(0,0,0,0.5)",
    }),

    # ── Floating tooltip
    html.Div([
        html.Div("", id="tt-title",
                 style={"font-weight": "600", "color": "#e8e8ea", "margin-bottom": "4px",
                         "font-size": "12.5px", "line-height": "1.3"}),
        html.Div("", id="tt-meta",
                 style={"color": "#4a5a6a", "font-family": "IBM Plex Mono, monospace",
                         "font-size": "10px", "letter-spacing": "0.04em", "margin-bottom": "6px"}),
        html.Div("", id="tt-desc",
                 style={"color": "#8090a0", "font-size": "11.5px", "line-height": "1.5",
                         "max-width": "240px"}),
    ], id="tooltip", style={
        "display": "none", "position": "fixed", "z-index": "500",
        "background": "rgba(12,14,20,0.97)", "border": "1px solid #1e2840",
        "border-radius": "7px", "padding": "10px 13px",
        "box-shadow": "0 6px 28px rgba(0,0,0,0.6)", "pointer-events": "none",
        "max-width": "280px",
    }),

    # ── Graph
    html.Div([
        cyto.Cytoscape(
            id="graph",
            elements=build_elements(),
            layout={"name": "preset"},
            stylesheet=STYLESHEET,
            style={"width": "100%", "height": "100%"},
            minZoom=0.08,
            maxZoom=5.0,
            zoom=0.46,
            pan={"x": -320, "y": 490},
            userZoomingEnabled=True,
            userPanningEnabled=True,
            boxSelectionEnabled=False,
            autoungrabify=False,
        )
    ], style={
        "position": "fixed", "top": "50px", "left": 0, "right": 0, "bottom": 0,
        "background": "#0a0a0b",
    }),

    # ── Right slide-in detail panel
    html.Div([
        html.Div([
            # Close button
            html.Button("×", id="close-btn", n_clicks=0, style={
                "position": "absolute", "top": "14px", "right": "14px",
                "background": "#1a1e2a", "border": "1px solid #2a3040",
                "color": "#6a7a8a", "width": "28px", "height": "28px",
                "border-radius": "6px", "cursor": "pointer", "font-size": "16px",
                "line-height": "1", "display": "flex", "align-items": "center",
                "justify-content": "center", "z-index": "10",
            }),
            html.Div(id="panel-body", style={"padding": "26px 22px 50px"}),
        ], style={"position": "relative"}),
    ], id="detail-panel", style={
        "position": "fixed", "top": "50px", "right": 0, "bottom": 0,
        "width": "340px", "background": "#0f1118", "border-left": "1px solid #1a2030",
        "overflow-y": "auto", "z-index": "150",
        "transform": "translateX(100%)",
        "transition": "transform 0.3s cubic-bezier(0.4,0,0.2,1)",
        "box-shadow": "-12px 0 40px rgba(0,0,0,0.5)",
    }),

    # ── Timeline axis overlay (decorative labels)
    html.Div([
        *[html.Span(str(yr), style={
            "position": "absolute",
            "left": f"{(yr - 1950) / (2065 - 1950) * 100:.1f}%",
            "font-family": "IBM Plex Mono, monospace", "font-size": "9px",
            "color": "#2a3040", "transform": "translateX(-50%)",
            "letter-spacing": "0.06em",
        }) for yr in range(1960, 2066, 10)],
        html.Span("NOW", style={
            "position": "absolute", "left": f"{(2026 - 1950) / (2065 - 1950) * 100:.1f}%",
            "font-family": "IBM Plex Mono, monospace", "font-size": "9px",
            "color": "#c8a030", "transform": "translateX(-50%)", "letter-spacing": "0.1em",
        }),
    ], style={
        "position": "fixed", "bottom": "6px", "left": "232px", "right": "16px",
        "height": "16px", "z-index": "50", "pointer-events": "none",
    }),

], style={
    "background": "#0a0a0b", "min-height": "100vh", "overflow": "hidden",
    "font-family": "'IBM Plex Sans', system-ui, -apple-system, sans-serif",
})


# ── 8. CALLBACKS ──────────────────────────────────────────────────────────────

# Tooltip: clientside for zero-latency cursor following
app.clientside_callback(
    """
    function(nodeData, _) {
        if (!nodeData) {
            return [{display: 'none'}, '', '', ''];
        }
        var x = (window.__mx || 0) + 18;
        var y = Math.max(60, (window.__my || 0) - 10);
        // Keep tooltip inside viewport
        if (x + 300 > window.innerWidth) x = (window.__mx || 0) - 295;
        return [
            {
                display: 'block', position: 'fixed',
                left: x + 'px', top: y + 'px'
            },
            nodeData.label,
            nodeData.category + '  ·  ' + nodeData.year + '  ·  ' + nodeData.rel_count + ' links',
            nodeData.desc || ''
        ];
    }
    """,
    [Output("tooltip",  "style"),
     Output("tt-title", "children"),
     Output("tt-meta",  "children"),
     Output("tt-desc",  "children")],
    [Input("graph", "mouseoverNodeData"),
     Input("graph", "mouseoutNodeData")],
)


@app.callback(
    Output("graph",        "elements"),
    Output("graph",        "style"),    # bump to re-render panel open/close
    Output("detail-panel", "style"),
    Output("panel-body",   "children"),
    Output("selected-store", "data"),
    Input("graph",        "tapNodeData"),
    Input("close-btn",    "n_clicks"),
    State("selected-store", "data"),
)
def handle_interaction(tap_data, close_clicks, current_selection):
    from dash import callback_context
    ctx = callback_context
    if not ctx.triggered:
        raise PreventUpdate

    trigger = ctx.triggered[0]["prop_id"]

    PANEL_CLOSED = {
        "position": "fixed", "top": "50px", "right": 0, "bottom": 0,
        "width": "340px", "background": "#0f1118", "border-left": "1px solid #1a2030",
        "overflow-y": "auto", "z-index": "150",
        "transform": "translateX(100%)",
        "transition": "transform 0.3s cubic-bezier(0.4,0,0.2,1)",
        "box-shadow": "-12px 0 40px rgba(0,0,0,0.5)",
    }
    PANEL_OPEN = {**PANEL_CLOSED, "transform": "translateX(0)"}
    GRAPH_STYLE = {"width": "100%", "height": "100%"}

    # Close
    if "close-btn" in trigger:
        return build_elements(), GRAPH_STYLE, PANEL_CLOSED, html.Div(), None

    # Tap on same node → deselect
    if tap_data:
        node_id = tap_data["id"]
        if node_id == current_selection:
            return build_elements(), GRAPH_STYLE, PANEL_CLOSED, html.Div(), None
        # Select new node
        elements    = build_elements(node_id)
        panel_body  = build_panel_content(node_id)
        return elements, GRAPH_STYLE, PANEL_OPEN, panel_body, node_id

    raise PreventUpdate


# ── 9. RUN ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("\n  Robotics Knowledge Atlas")
    print("  ─────────────────────────────────")
    print(f"  {total_nodes} articles  ·  {emerging_n} emerging  ·  226 edges")
    print("\n  Open http://127.0.0.1:8050\n")
    app.run(debug=False, host="127.0.0.1", port=8050)