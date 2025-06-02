const dfd_readcsv = require('danfojs').readCSV;
const CI = require('./ci_test');

// expose to window so your DAGitty code can call them:
// window.setup = setup;
window.uploadFile = uploadFile;
window.send = send;
window.pillai_test    = CI.pillai_test;
window.compute_effects = CI.compute_effects;

let data = null;


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

// async function uploadFile() {
//         const fileInput = document.getElementById('fileInput');
//         const file = fileInput.files[0];
// 
//         if (!file) {
//         	alert("Please select a file.");
//         	return;
//         }
// 
//         const formData = new FormData();
//         formData.append('file', file);
// 
// 	let result;
// 	try{
//         	const response = await fetch('http://127.0.0.1:8000/upload', {
//                 	method: 'POST',
//                 	body: formData
// 		});
// 		result = await response.json();
// 	} catch(error){
//         	console.error('Error:', error);
//         	alert('File upload failed');
//         }
// 
// 	// Create an empty DAG with the variables.
// 	const graph = document.getElementById('dagitty_graph');
// 	graph.innerHTML = "dag{ " + JSON.parse(result.body[0])['var_names'].join(" ") + " }";
// 	DAGitty.setup();
// 	DAGitty.controllers[0].event_listeners["graphchange"][0] = send;
// 	send();
// }

async function uploadFile() {
  const fileInput = document.getElementById('fileInput');
  const file = fileInput.files[0];
  if (!file) {
    alert("Please select a CSV file first.");
    return;
  }

  try {
    const df = await dfd_readcsv(file);

    data = df;

    const varNames = df.columns;
    const graph = document.getElementById('dagitty_graph');
    graph.innerHTML = "dag{ " + varNames.join(" ") + " }";
    DAGitty.setup();

    DAGitty.controllers[0].event_listeners["graphchange"][0] = send;
    send();
  }
  catch (err) {
    console.error("Error parsing CSV into DataFrame:", err);
    alert("Could not parse CSV. Make sure it's a well‐formed file.");
  }
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

	effects = compute_effects( g, data);
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

// function setup(){
// 	// DAGitty.setup()
// 	// DAGitty.controllers[0].event_listeners["graphchange"][0] = send
// 	// send()
// }

