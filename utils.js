const dfd_readcsv = require('danfojs').readCSV;
const CI = require('./ci_test');

// Expose functions to window
window.uploadFile = uploadFile;
window.send = send;
window.pillai_test    = CI.pillai_test;
window.compute_effects = CI.compute_effects;
window.onVarTypeConfirmed = onVarTypeConfirmed;
window.rmsea = CI.rmsea;

let data = null;
let varTypes = {};


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
    // 1. Read CSV.
    const df = await dfd_readcsv(file);
    data = df;

    // 2. Build the empty graph with variables in the CSV.
    const varNames = df.columns;
    const graph = document.getElementById('dagitty_graph');
    graph.innerHTML = "dag{ " + varNames.join(" ") + " }";
    DAGitty.setup();

    // 3. Show a panel to choose variable type.
    const panel = document.getElementById('varTypePanel');
    panel.style.display = "block";
    const form = document.getElementById('varTypeForm');
    form.innerHTML = ""; // clear any old content

    varTypes = {};

    varNames.forEach(varName => {
      // Create a container <div> for each variable
      const rowDiv = document.createElement('div');
      rowDiv.style.marginBottom = "0.5em";

      //  a) label
      const label = document.createElement('label');
      label.textContent = varName + ": ";
      label.setAttribute("for", "type_of_" + varName);
      label.style.marginRight = "0.5em";

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

      // Try to make a default selection.
      const sampleVals = df[varName].values.slice(0, 10);
      const allNumericSample = sampleVals.every(v => typeof v === "number");
      select.value = allNumericSample ? "continuous" : "categorical";

      // Store changes in varTypes.
      select.onchange = function() {
        varTypes[varName] = this.value;
      };
      varTypes[varName] = select.value;

      rowDiv.appendChild(label);
      rowDiv.appendChild(select);
      form.appendChild(rowDiv);
    });
  }
  catch (err) {
    console.error("Error parsing CSV into DataFrame:", err);
    alert("Could not parse CSV. Make sure it’s a well‐formed file.");
  }
}


// Called when the user clicks “OK” under the variable‐type form:
function onVarTypeConfirmed() {
  // Hide the “Variable Type” panel once they’ve confirmed:
  document.getElementById('varTypePanel').style.display = "none";

  DAGitty.controllers[0].event_listeners["graphchange"][0] = send;
  send();
}

async function send(){
	let g  = DAGitty.controllers[0].graph
	DAGitty.controllers[0].event_listeners["graphchange"] = []

	// remove all undirected edges
	g = dagOnly(g)

	// send DAG to backend for testing
	// const a = await fetch('http://127.0.0.1:8000/getassoc?dag='+encodeURIComponent(g.toString())+'&threshold='+document.getElementById('thres_txt').value+'&pval='+document.getElementById('pval_txt').value)
	// const b = await a.json()
	//

	// const fisher = await fetch('http://127.0.0.1:8000/rmsea?dag='+encodeURIComponent(g.toString()))
	// const pval = await fisher.json()
	// document.getElementById('fisherc').innerHTML = 0;

	const effect_thresh = document.getElementById('thres_txt').value;
	const pval_thresh = document.getElementById('pval_txt').value;

	effects = compute_effects( g, data, pval_thresh, effect_thresh );
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

	DAGitty.controllers[0].setGraph( g )
	DAGitty.controllers[0].redraw() // creates new edge shapes*/
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
	DAGitty.controllers[0].event_listeners["graphchange"][0] = send
}

