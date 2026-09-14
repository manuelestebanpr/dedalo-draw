# MCP payloads

Discover host-specific namespace prefixes. Replace "Payments" below with the selected name from list_canvases. Pass canvasName consistently; the server permits omission only when exactly one canvas is connected. Names select live tabs, including unsaved canvases, rather than files.
- get_connection_status({canvasName?:string}) → bridgeAvailable, canvasConnected, canvases:[{name}], and a canvas summary when a target is specified or only one canvas is connected.
- list_canvases({}) → [{name}] for connected live canvases. No save is required.
- get_scene({canvasName:"Payments",view:"summary"}) → name, revision, counts, groups.
- get_scene({canvasName:"Payments",view:"items"|"connections",offset:0,limit:200,ids?:[],group?:string}) → revision,total,offset,rows. Page to total.
- get_catalog({}) → templates with section/kind/icon/shape, kinds, icons, colors and analysis records.
- inspect_canvas({canvasName:"Payments"}) → summary, mimeType, expanded SVG. Concurrent revision changes cause an error.
- focus({canvasName:"Payments",ids:["api"],group:""}) frames IDs and clears group highlight.
- get_analysis({canvasName:"Payments",id?:string,scopeId?:string}) → saved analysis or draft with coupling; omit both for parent draft and saved summaries.
- apply_transaction accepts canvasName and baseRevision plus optional upsertItems, upsertConnections, deleteIds, upsertAnalyses, deleteAnalysisIds. Item deletion cascades children and edges; historical analyses remain.
- save_project({canvasName:"Payments",name:"review"}) / export_svg({canvasName:"Payments",name:"review"}) write new files in DEDALO_SCENES_DIR (default project/scenes).
- load_project({canvasName:"Payments",name:"review",baseRevision:CURRENT}) replaces the scene as one undoable operation.

For save/load/export, name is the file basename and canvasName is the live target. Canvas names may contain spaces and punctuation. Loading a file whose project title belongs to another connected canvas fails without changing the target. A successful load can change the live name; rediscover and read the loaded canvas before continuing.

Example new component; substitute the canvas name and its revision/IDs after inspection:

    {"canvasName":"Payments","baseRevision":12,"upsertItems":[
      {"id":"domain","kind":"container","name":"Orders","x":100,"y":100,"width":700,"height":300,"icon":"box"},
      {"id":"api","kind":"service","name":"Order API","parentId":"domain","x":40,"y":90,"icon":"server","details":{"description":"Accepts idempotent orders."}},
      {"id":"db","kind":"database","name":"Ledger","parentId":"domain","x":390,"y":90,"icon":"postgresql"}
    ],"upsertConnections":[
      {"id":"sql","source":"api","target":"db","name":"Commit order + outbox","details":{"protocol":"SQL","failure":"Do not acknowledge uncommitted orders."}}
    ]}

New records receive defaults. Existing objects must be merged in full or omitted fields reset. Omitted description receives starter purpose; description:"" or defaultPurpose:false leaves it empty intentionally.


parentId is returned as inferred ownership. When supplied on input, x/y are relative to that parent; geometry determines the committed owner. Any positive-area card overlap counts. For world-coordinate placement omit parentId. Do not send sourcePort, targetPort, component status or component details.security; legacy imports discard them. Connection details.security remains available.
