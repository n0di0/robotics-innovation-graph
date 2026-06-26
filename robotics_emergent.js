const NODES = [
  { id:'Emergent robotics', label:'Emergent robotics', cluster:'Core', yearSort:2026, node_type:'category', description:'Focused view of the most emergent technologies in the chain analysis.', parent:null },
  { id:'Starcloud', label:'Starcloud', cluster:'Infrastructure', yearSort:2026, node_type:'platform', description:'Nascent AI data-center concept for robotics workloads.', parent:'Emergent robotics', readiness:12, maturity:'Innovation Trigger', forecast:0.994, note:'Compute and telemetry bottlenecks dominate.' },
  { id:'Hyperscaler', label:'Hyperscaler', cluster:'Infrastructure', yearSort:2026, node_type:'platform', description:'Cloud-scale infrastructure used for robotics training and fleet learning.', parent:'Emergent robotics', readiness:28, maturity:'Innovation Trigger', forecast:0.994, note:'Latency and API standardization remain key blockers.' },
  { id:'Pre-bioprinting', label:'Pre-bioprinting', cluster:'Biofabrication', yearSort:2021, node_type:'process', description:'Automated preparation steps before bioprinting.', parent:'Emergent robotics', readiness:18, maturity:'Innovation Trigger', forecast:0.959, note:'Sterility and workflow automation are the main gaps.' },
  { id:'Bioinks', label:'Bioinks', cluster:'Materials', yearSort:2021, node_type:'material', description:'Printable biological materials used in bioprinting and biohybrid systems.', parent:'Emergent robotics', readiness:22, maturity:'Innovation Trigger', forecast:0.959, note:'Mechanical-property tuning is still a bottleneck.' },
  { id:'Bioprinting', label:'Bioprinting', cluster:'Fabrication', yearSort:2021, node_type:'process', description:'Robotic printing of biological structures and tissues.', parent:'Emergent robotics', readiness:22, maturity:'Innovation Trigger', forecast:0.959, note:'Closed-loop sensing is still early.' },
  { id:'Autonomous self-assembly', label:'Autonomous self-assembly', cluster:'Fabrication', yearSort:2021, node_type:'process', description:'Systems that assemble themselves with minimal external control.', parent:'Emergent robotics', readiness:18, maturity:'Innovation Trigger', forecast:0.959, note:'Energy autonomy and smart materials are major blockers.' },
  { id:'Biomimicry', label:'Biomimicry', cluster:'Design', yearSort:2021, node_type:'design', description:'Nature-inspired design strategy for soft and adaptive robots.', parent:'Emergent robotics', readiness:30, maturity:'Peak of Inflated Expectations', forecast:0.945, note:'A strong enabler, but still early in deployment.' },
  { id:'Multiphoton lithography', label:'Multiphoton lithography', cluster:'Manufacturing', yearSort:2024, node_type:'manufacturing', description:'High-resolution additive technique for micro-scale structures.', parent:'Emergent robotics', readiness:26, maturity:'Innovation Trigger', forecast:0.941, note:'Precision is strong; throughput and cost remain concerns.' },
  { id:'Microstereolithography', label:'Microstereolithography', cluster:'Manufacturing', yearSort:2024, node_type:'manufacturing', description:'Micro-scale photopolymer printing for precision components.', parent:'Emergent robotics', readiness:24, maturity:'Innovation Trigger', forecast:0.941, note:'Useful for prototypes, not yet broad production.' }
];

const LINKS = [
  { source:'Emergent robotics', target:'Starcloud', relationship:'infrastructure' },
  { source:'Emergent robotics', target:'Hyperscaler', relationship:'infrastructure' },
  { source:'Emergent robotics', target:'Pre-bioprinting', relationship:'biofabrication' },
  { source:'Emergent robotics', target:'Bioinks', relationship:'materials' },
  { source:'Emergent robotics', target:'Bioprinting', relationship:'fabrication' },
  { source:'Emergent robotics', target:'Autonomous self-assembly', relationship:'fabrication' },
  { source:'Emergent robotics', target:'Biomimicry', relationship:'design' },
  { source:'Emergent robotics', target:'Multiphoton lithography', relationship:'manufacturing' },
  { source:'Emergent robotics', target:'Microstereolithography', relationship:'manufacturing' },
  { source:'Pre-bioprinting', target:'Bioprinting', relationship:'pipeline' },
  { source:'Bioinks', target:'Bioprinting', relationship:'material feedstock' },
  { source:'Biomimicry', target:'Autonomous self-assembly', relationship:'design inspiration' },
  { source:'Multiphoton lithography', target:'Microstereolithography', relationship:'adjacent tech' }
];

const svg = d3.select('#svg');
const wrap = document.getElementById('graph-wrap');
const tooltip = document.getElementById('tooltip');
const sidebarTitle = document.getElementById('panel-title');
const sidebarSub = document.getElementById('panel-sub');
const sidebarContent = document.getElementById('panel-content');

const gRoot = svg.append('g');
const gBands = gRoot.append('g');
const gGrid = gRoot.append('g');
const gLinks = gRoot.append('g');
const gNodes = gRoot.append('g');
const gLabels = gRoot.append('g');

svg.call(d3.zoom().scaleExtent([0.45,2.8]).on('zoom', e => gRoot.attr('transform', e.transform)));

const nodeById = new Map(NODES.map(d => [d.id, d]));
let selectedId = null;

function esc(s){return String(s).replace(/[&<>\"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));}

function updateSidebar(d){
  sidebarTitle.textContent = d.label;
  sidebarSub.textContent = `${d.cluster} • ${d.yearSort} • ${d.maturity || '—'}`;
  sidebarContent.innerHTML = `
    <div class="meta-section"><h3>Description</h3><div class="v">${esc(d.description || '')}</div></div>
    <div class="meta-section"><h3>Emergence</h3><div class="kv">
      <div class="k">Readiness</div><div class="v">${d.readiness ?? '—'}%</div>
      <div class="k">Forecast</div><div class="v">${d.forecast ?? '—'}</div>
      <div class="k">Maturity</div><div class="v">${esc(d.maturity || '—')}</div>
      <div class="k">Note</div><div class="v">${esc(d.note || '—')}</div>
    </div></div>
    <div class="meta-section"><h3>Metadata</h3><div class="kv">
      ${Object.entries(d).map(([k,v]) => `<div class="k">${esc(k)}</div><div class="v">${esc(v === null ? 'null' : String(v))}</div>`).join('')}
    </div></div>`;
}

function render(){
  const w = wrap.clientWidth, h = wrap.clientHeight;
  const margin = {top:90,right:40,bottom:55,left:40};
  const innerW = Math.max(400, w - margin.left - margin.right);
  const innerH = Math.max(300, h - margin.top - margin.bottom);

  svg.attr('viewBox',[0,0,w,h]);
  gRoot.attr('transform',`translate(${margin.left},${margin.top})`);

  const xScale = d3.scaleLinear().domain(d3.extent(NODES,d=>d.yearSort)).range([90,innerW-100]);
  const clusters = Array.from(d3.group(NODES,d=>d.cluster), ([key,vals]) => ({key,vals}));
  const yScale = d3.scaleBand().domain(clusters.map(d=>d.key)).range([20,innerH-30]).padding(0.28);
  NODES.forEach(n => { n.x = xScale(n.yearSort); n.y = yScale(n.cluster) + yScale.bandwidth()/2; });

  gBands.selectAll('*').remove();
  gGrid.selectAll('*').remove();
  gLinks.selectAll('*').remove();
  gNodes.selectAll('*').remove();
  gLabels.selectAll('*').remove();

  gBands.selectAll('rect').data(clusters).enter().append('rect')
    .attr('class','cluster-band')
    .attr('x',0)
    .attr('y',d=>yScale(d.key)-12)
    .attr('width',innerW)
    .attr('height',yScale.bandwidth()+24)
    .attr('rx',16)
    .attr('ry',16);

  gLabels.selectAll('text').data(clusters).enter().append('text')
    .attr('class','cluster-label')
    .attr('x',10)
    .attr('y',d=>yScale(d.key)-16)
    .text(d=>d.key);

  const ticks = xScale.ticks(6);
  gGrid.selectAll('line').data(ticks).enter().append('line')
    .attr('class','gridline')
    .attr('x1',d=>xScale(d))
    .attr('x2',d=>xScale(d))
    .attr('y1',-8)
    .attr('y2',innerH+10);

  gGrid.selectAll('text').data(ticks).enter().append('text')
    .attr('class','axis-label')
    .attr('x',d=>xScale(d))
    .attr('y',innerH+32)
    .attr('text-anchor','middle')
    .text(d=>d);

  const curve = d => {
    const s = nodeById.get(d.source), t = nodeById.get(d.target);
    if(!s || !t) return '';
    const dx = Math.max(22, Math.abs(t.x - s.x) * 0.45);
    return `M${s.x},${s.y} C${s.x+dx},${s.y} ${t.x-dx},${t.y} ${t.x},${t.y}`;
  };

  const linkSel = gLinks.selectAll('path').data(LINKS).enter().append('path')
    .attr('class','link')
    .attr('d',curve);

  const nodeSel = gNodes.selectAll('g').data(NODES).enter().append('g')
    .attr('class','node')
    .attr('transform',d=>`translate(${d.x},${d.y})`)
    .on('mousemove',(event,d)=>{
      tooltip.style.opacity=1;
      tooltip.style.left = event.offsetX + 'px';
      tooltip.style.top = event.offsetY + 'px';
      tooltip.innerHTML = `<strong>${esc(d.label)}</strong><br>${esc(d.description || '')}`;
    })
    .on('mouseleave',()=>{ tooltip.style.opacity=0; })
    .on('click',(event,d)=>{
      event.stopPropagation();
      selectedId = d.id;
      updateHighlights();
      updateSidebar(d);
    });

  nodeSel.append('circle')
    .attr('r',d=>9 + Math.min(10, (LINKS.filter(l=>l.source===d.id || l.target===d.id).length)*0.7))
    .attr('fill',d=> d.node_type==='category'
      ? getComputedStyle(document.documentElement).getPropertyValue('--category').trim()
      : getComputedStyle(document.documentElement).getPropertyValue('--emerging').trim());

  nodeSel.append('text')
    .attr('x',12)
    .attr('y',4)
    .text(d=>d.label);

  function updateHighlights(){
    const selected = selectedId ? nodeById.get(selectedId) : null;
    const active = new Set([selectedId]);
    if(selected){
      LINKS.forEach(l=>{
        if(l.source===selected.id) active.add(l.target);
        if(l.target===selected.id) active.add(l.source);
      });
    }
    nodeSel
      .classed('highlight', d=>selected && active.has(d.id))
      .classed('selected', d=>selected && d.id===selected.id)
      .classed('dim', d=>selected && !active.has(d.id));
    linkSel
      .classed('highlight', d=>selected && (d.source===selected.id || d.target===selected.id))
      .classed('dim', d=>selected && !(d.source===selected.id || d.target===selected.id));
  }

  updateHighlights();

  svg.on('click',()=>{
    selectedId=null;
    sidebarTitle.textContent='Select a node';
    sidebarSub.textContent='Metadata will appear here.';
    sidebarContent.innerHTML='';
    updateHighlights();
  });
}

render();
window.addEventListener('resize', render);