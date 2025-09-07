const dfd_readcsv = require('danfojs').readCSV;
const CI = require('./ci_test');

// expose to window so your DAGitty code can call them:
// window.setup = setup;
window.uploadFile = uploadFile;
window.send = send;
window.pillai_test    = CI.pillai_test;
window.pearsonr = CI.pearsonr;
window.compute_effects = CI.compute_effects;
window.onVarTypeConfirmed = onVarTypeConfirmed;
window.rmsea = CI.rmsea;
window.loadExampleDataset = loadExampleDataset;

let data = null;
let varTypes = {}; 

// Placeholder mapping for future example dataset URLs; to be filled later by user.
// Keys must match values used in #example_dataset_select options.
const EXAMPLE_DATASET_URLS = {
  example1: 'https://raw.githubusercontent.com/ankurankan/2025-causal-discovery-webapp/refs/heads/new_features/examples/mediator.csv',
  example2: 'https://raw.githubusercontent.com/ankurankan/2025-causal-discovery-webapp/refs/heads/new_features/examples/asia.csv',
  example3: 'https://raw.githubusercontent.com/ankurankan/2025-causal-discovery-webapp/refs/heads/new_features/examples/cancer.csv',
  example4: 'https://raw.githubusercontent.com/ankurankan/2025-causal-discovery-webapp/refs/heads/new_features/examples/alarm.csv',
  example5: 'https://raw.githubusercontent.com/ankurankan/2025-causal-discovery-webapp/refs/heads/new_features/examples/ecoli70.csv'
};

// Ensure a status element exists (created lazily)
function setComputingStatus(active){
  let el = document.getElementById('computing_status');
  if(!el){
    el = document.createElement('div');
    el.id = 'computing_status';
    // Prefer placing inside the dagitty graph container so absolute centering works
    const graph = document.getElementById('dagitty_graph');
    if(graph){
      graph.appendChild(el);
    } else {
      document.body.appendChild(el);
    }
  }
  if(active){
    el.textContent = 'Computing…';
    el.style.display = 'flex';
    requestAnimationFrame(()=>{ el.classList.add('show'); });
  } else {
    el.classList.remove('show');
    // after transition hide
    setTimeout(()=>{ if(!el.classList.contains('show')) el.style.display='none'; }, 200);
  }
}

// Fetch an example dataset by key, expecting EXAMPLE_DATASET_URLS to hold a URL.
async function loadExampleDataset(key){
  if(!key){ return; }
  const url = EXAMPLE_DATASET_URLS[key];
  if(!url){
    alert('No URL configured yet for ' + key + '. Please provide one.');
    return;
  }
  try {
    setComputingStatus(true);
    const resp = await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now());
    if(!resp.ok){ throw new Error('HTTP '+resp.status); }
    const csvText = await resp.text();
    const nameGuess = key + '.csv';
    const blob = new Blob([csvText], {type:'text/csv'});
    const file = new File([blob], nameGuess, {type:'text/csv'});
    const dt = new DataTransfer();
    dt.items.add(file);
    const fileInput = document.getElementById('fileInput');
    if(fileInput){ fileInput.files = dt.files; }
    await uploadFile();
  } catch(err){
    console.error('Failed to load example dataset', key, err);
    alert('Could not load example dataset: ' + key + '\n' + err.message);
  } finally {
    setComputingStatus(false);
  }
}


function getEdgeDOM( u , v, dir ){
	let ekv = DAGitty.controllers[0].getView().edge_shapes.kv;
	let eid = `${u.id}\u0000${v.id}\u0000${dir}`;
	if( ekv[eid] ) {
		return ekv[eid].dom.firstChild;
	} else {
		return null;
	}
}

function dagOnly(){
	let g = DAGitty.controllers[0].graph
	let g2 = new Graph()
	for( let v of g.getVertices() ){
		g2.addVertex( new Graph.Vertex( v ) )
	}
	for( let e of g.getEdges() ){
		if( e.directed == Graph.Edgetype.Directed ){
			g2.addEdge( e.v1, e.v2, e.directed )
		}
	}
	g.copyAllPropertiesTo( g2 )
	g2.setBoundingBox( g.getBoundingBox() )	
	return g2
}

async function uploadFile() {
  const fileInput = document.getElementById('fileInput');
  const file = fileInput.files[0];
  if (!file) {
    alert("Please select a CSV file first.");
    return;
  }

  try {
    // Clear our globals (data will be set below)
    varTypes = {};

    // (1) Read CSV into a Danfo.js DataFrame
    const df = await dfd_readcsv(file);
    data = df;

    // (2) Build the DAGitty “empty” graph just as before
    const varNames = df.columns;
    const spec = "dag{ " + varNames.join(" ") + " }";

    // Helper to (re)load dagitty script fresh each upload to avoid stale controllers
    async function loadDagittyFresh(specStr){
      const graphEl = document.getElementById('dagitty_graph');
      // Replace node to drop old listeners
      const fresh = graphEl.cloneNode(false);
      fresh.id = 'dagitty_graph';
      graphEl.parentNode.replaceChild(fresh, graphEl);
      fresh.setAttribute('data-mutable','true');
      fresh.classList.add('dagitty');
      fresh.innerHTML = specStr;

      // Remove previous dagitty script tags (if any)
      document.querySelectorAll('script[src*="dagitty-3.0"]').forEach(s => s.remove());
      // Reset controllers if object exists
      if (window.DAGitty && DAGitty.controllers) {
        try { DAGitty.controllers.length = 0; } catch(_) {}
      }
      await new Promise(r=>setTimeout(r,0));
      await new Promise((resolve,reject)=>{
        const sc = document.createElement('script');
        sc.src = 'https://dagitty.net/lib/dagitty-3.0.js?reload=' + Date.now();
        sc.onload = ()=>{ try { DAGitty.setup(); resolve(); } catch(e){ reject(e);} };
        sc.onerror = reject;
        document.head.appendChild(sc);
      });
      if (!(DAGitty.controllers && DAGitty.controllers[0])) {
        console.warn('[uploadFile] DAGitty controller still missing after script reload');
      } else {
        console.log('[uploadFile] Graph initialized with', varNames.length, 'variables');
      }
    }

    await loadDagittyFresh(spec);

    // (3) Show the “Variable Type” panel (previously hidden)
  const panel = document.getElementById('varTypePanel');
  const backdrop = document.getElementById('varTypeBackdrop');
  panel.style.display = "block";
  if(backdrop) backdrop.style.display = 'block';

    // (4) Populate #varTypeForm with one row per variable
    const form = document.getElementById('varTypeForm');
    form.innerHTML = ""; // clear any old content

    varTypes = {}; // reset

    varNames.forEach(varName => {
      // Create a container <div> for each variable
      const rowDiv = document.createElement('div');
      rowDiv.className = 'var-type-row';

      //  a) label
      const label = document.createElement('label');
      label.textContent = varName + ":"; // colon kept, spacing handled by CSS gap
      label.setAttribute("for", "type_of_" + varName);

      //  b) <select> element
      const select = document.createElement('select');
      select.id = "type_of_" + varName;
      select.name = varName;

      //  c) two <option> entries
      const optCont = document.createElement('option');
      optCont.value = "continuous";
      optCont.text = "Continuous";
      const optCat = document.createElement('option');
      optCat.value = "categorical";
      optCat.text = "Categorical";

      select.appendChild(optCont);
      select.appendChild(optCat);

      // default selection: try an automatic guess
      // (e.g. if the column’s dtype is “object” or string‐like, pick categorical)
      // Danfo.js doesn’t give you dtype directly, but you can check a few rows:
      const sampleVals = df[varName].values.slice(0, 10);
      const allNumericSample = sampleVals.every(v => typeof v === "number");
      select.value = allNumericSample ? "continuous" : "categorical";

      // whenever user changes the dropdown, store it into varTypes:
      select.onchange = function() {
        varTypes[varName] = this.value;
      };

      // initialize varTypes right away:
      varTypes[varName] = select.value;

  rowDiv.appendChild(label);
  rowDiv.appendChild(select);
      form.appendChild(rowDiv);
    });

    // (5) Wire up graph‐change listener AFTER user confirms variable types
    //     (we’ll do that in onVarTypeConfirmed())
  }
  catch (err) {
    console.error("Error parsing CSV into DataFrame:", err);
    alert("Could not parse CSV. Make sure it’s a well‐formed file.");
  }
}


// Called when the user clicks “OK” under the variable‐type form:
function onVarTypeConfirmed() {
  // (1) Hide the “Variable Type” panel once they’ve confirmed:
  const panel = document.getElementById('varTypePanel');
  const backdrop = document.getElementById('varTypeBackdrop');
  panel.style.display = "none";
  if(backdrop) backdrop.style.display = 'none';

  // (2) Now that varTypes is filled, we can allow the DAGitty graph to “send”:
  if (DAGitty.controllers && DAGitty.controllers[0]) {
    DAGitty.controllers[0].event_listeners["graphchange"][0] = send;
  }

  // (3) Immediately call send() once, so edges appear with the new types:
  send();
}



async function send(){
  if (!DAGitty.controllers || !DAGitty.controllers[0]) {
    console.warn('[send] No controller; abort');
    return;
  }
  const controller = DAGitty.controllers[0];
  let g  = controller.graph;
  controller.event_listeners["graphchange"] = []

	// remove all undirected edges
	g = dagOnly(g)

	const effect_thresh = document.getElementById('thres_txt').value;
	const pval_thresh = document.getElementById('pval_txt').value;

  // Determine selected CI method from dropdown (if present)
  let ciMethodSel = document.getElementById('ci_test_select');
  let ci_method = ciMethodSel ? ciMethodSel.value : 'pillai_trace';

  // Show status before heavy synchronous work; yield to render cycle
  setComputingStatus(true);
  await new Promise(r => setTimeout(r,0));
  effects = compute_effects( g, data, pval_thresh, effect_thresh, ci_method );
	if( Array.isArray(effects) ){
		for( let e of effects ){
			e.edge = e.A == "->"
			if( !e.edge ){
				g.addEdge( e.X, e.Y, Graph.Edgetype.Undirected )
			}
		}
	} else {
		return
	}
	const rmsea_val = rmsea( g, data);
	document.getElementById('rmsea').innerHTML = rmsea_val.toFixed(3);

  controller.setGraph( g )
  controller.redraw() // creates new edge shapes*/
	//return
	for( let e of effects ){
		let edom = getEdgeDOM( e.X, e.Y, 0+e.edge )
		if( !edom && e.edge ){
			edom = getEdgeDOM( e.v, e.u, 0+e.edge )

		}
		if( edom ){
			edom.style.strokeWidth = 5*parseFloat(e.cor)
			if( e.edge ){
				edom.setAttribute("stroke", "#0A0")
			} else {
				edom.setAttribute("stroke", "#A00")
			}
		} else {
			console.log( e )
		}
	}
  controller.event_listeners["graphchange"][0] = send
  setComputingStatus(false);
}

