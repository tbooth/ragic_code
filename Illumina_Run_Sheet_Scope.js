/**
 * This comment is auto generated on 2024/10/24 14:39:18, and it reflects the field definition at this given time.
 * If you need the current field definitions for your database, please go to "Start" => "Account Setup" => "DB Maintenance" => "Download Data Dictionary"

 * AP_Name:edgen
 * Key Field: 1000014

 * Pool subtable key: 1000015

 * Pool subtable key: 1000034

 * Pool subtable key: 1000035

 * Pool subtable key: 1000036

 * Project subtable key: 1000056

 * Field Name              Field Id
 * - - - - - - - - - - - --------
 * Run ID                 : 1000037
 * Run QC Report          : 1000048
 * Experiment             : 1000044
 * Flowcell ID            : 1000011
 * Chemistry              : 1000047
 * R1 Cycles              : 1000045
 * R2 Cycles              : 1000046
 * Project                : 1000020
   * Project                : 1000052
   * Pool                   : 1000053
   * Samples in Pool        : 1000054
   * Add to Lane            : 1000055
 * Lane 1 index revcomp   : 1000040
 * Lane 2 index revcomp   : 1000041
 * Lane 3 index revcomp   : 1000042
 * Lane 4 index revcomp   : 1000043
   * Pool                   : 1000024
   * Library                : 1000013
   * Pool                   : 1000028
   * Library                : 1000029
   * Pool                   : 1000030
   * Library                : 1000031
   * Pool                   : 1000032
   * Library                : 1000033
 * Investigator           : 1000039
 * Last Update            : 109

 */

var ILLUMINA_RUN = { "_path":   "/sequencing/2",
                     "_id":     1000014,
                     "Project": 1000020 };

var LIST_OF_SAMPLES = { "_path":         "/sequencing/3",
                        "Project Name":  1000003,
                        "Sample ID":     1000004,
                        "Lib Name":      1000021,
                        "Def Pool Name": 1000051 };

var LANE_SUBTABLES = { "Lane 1": {"_id":     1000015,
                                  "Pool":    1000024,
                                  "Library": 1000013},
                       "Lane 2": {"_id":     1000034,
                                  "Pool":    1000028,
                                  "Library": 1000029},
                       "Lane 3": {"_id":     1000035,
                                  "Pool":    1000030,
                                  "Library": 1000031},
                       "Lane 4": {"_id":     1000036,
                                  "Pool":    1000032,
                                  "Library": 1000033} };

var POOL_SUBTABLE = { "_id": 1000056,
                      "Project": 1000052,
                      "Pool": 1000053,
                      "Samples in Pool": 1000054,
                      "Select": 1000055, // Aka "Add to Lane"
                      "Select-label": "Select..."};


function clear_all(record_id){
  /* Clear all the entries in all the lanes
   */  
  //log.setToConsole(true); // Uncomment this to display the console block
  log.println("==========");
  log.println("running: clear_all(" + record_id +")");

  var entry = db.getAPIQuery(ILLUMINA_RUN["_path"]).getAPIEntry(record_id);
  
  for (var i in LANE_SUBTABLES){
    var subtable_dict = LANE_SUBTABLES[i];
    var subtable_id = subtable_dict["_id"];
    log.println("Clearing out " + i + " = " + subtable_id);
   
    entry.deleteSubtableRowAll(subtable_id);
  }
  // If I implement my pool adding plan then I'll need to check that it doesn't
  // interact badly with this.
  log.println(entry.save().getMessage());
  
}

function pools_for_projects(projects_list){
    /* For each projects in projects_list,
     * get all the samples (libraries) for the project and build a data structure like this
     * 
     * { project1: { pool1: size,
     *               pool2: size},
     *   project2: { pool1: size,
     *               pool2: size}, ... }
     */
  	var res = {};
  
    if(projects_list.length == 0){
       log.println("pools_for_projects called with no projects selected");
       return res;
    }
  
    // Strategy here is to make a single query for all samples.
	var sample_query = db.getAPIQuery(LIST_OF_SAMPLES["_path"]);
    for (var i=0; i < projects_list.length; i++){
        log.println("Adding filter: " + LIST_OF_SAMPLES["Project Name"] + "=" + projects_list[i]);
  		sample_query.addFilter(LIST_OF_SAMPLES["Project Name"], '=', projects_list[i]);
    }
	var sample_entries = sample_query.getAPIResultsFull();
    var asample = sample_entries.next()
    while(asample){
      
      asample_project = asample.getFieldValue(LIST_OF_SAMPLES["Project Name"]);
      // For now, if the pool name is blank do I want to...
      // 1 - Skip this library?
      // 2 - Add all the pools to NoPool?
      // 3 - Put each library in its own "pool"?
      // For now I'll do 2.
      asample_pool = asample.getFieldValue(LIST_OF_SAMPLES["Def Pool Name"]) || "NoPool";
      
      if(!res[asample_project]) res[asample_project] = {}; 
      res[asample_project][asample_pool] = (res[asample_project][asample_pool] || 0) + 1;
      
      asample = sample_entries.next();
    }
  
    log.println("pools_for_projects returning:" + JSON.stringify(res));
    return res;
}

function select_to_lanes(select_val){
 	/* Translates one of the dropdown values in the Add Pools subtable into a
     * list of lanes into which the pool should be added. Always returns an array.
     */
    if(select_val == "All Lanes"){
      	return Object.keys(LANE_SUBTABLES);
    }
    else if(select_val == "Lanes 1 and 2"){
        // Special case because this is very common
        return ["Lane 1", "Lane 2"];
    }
  	else if(select_val.substring(0,5) == "Lane "){
  		return [select_val];
	}
    // Else, nothing to do.
    return [];
}

function is_in_list(x, alist){
    /* See if x is present in array alist.
     * I'm likely recreating something that already exists, but never mind.
     */
    for (var i=0; i < alist.length; i++){
      	if(alist[i] == x) return true;
    }
    return false;
}

function add_pool_to_lane(run_entry, pool_project, pool_name, expected_size, lane_name, new_row_idx){
	/* Adds a specified pool to a specified lane.
     *  
     * 1 - Fetch the list of libraries in the specified pool.
     * 2 - Sanity check the pool size matches
     * 3 - Sanity check the project is still in the list of projects for this run
     * 4 - Sanity check adding a sample twice
     * 5 - I we good, add the libraries to the actual subtable
     */
  	var lane_subtable = LANE_SUBTABLES[lane_name];
    var lane_subtable_len = run_entry.getSubtableSize(lane_subtable["_id"]);
    
    // 1 looks very similar to pools_for_projects.
    var pool_libraries = [];
  	var sample_query = db.getAPIQuery(LIST_OF_SAMPLES["_path"]);
	sample_query.addFilter(LIST_OF_SAMPLES["Project Name"], '=', pool_project);
    sample_query.addFilter(LIST_OF_SAMPLES["Def Pool Name"], '=', pool_name);
    if(pool_name == "NoPool"){
        // For this special case we also get the entries where Def Pool Name is blank
        sample_query.addFilter(LIST_OF_SAMPLES["Def Pool Name"], '=', "");
    }
	var sample_entries = sample_query.getAPIResultsFull();
    var asample = sample_entries.next()
    while(asample){
		// We only need to get the library names and add them to the array
        pool_libraries.push(asample.getFieldValue(LIST_OF_SAMPLES["Lib Name"]));

    	asample = sample_entries.next();
    }

    // 2
    if(pool_libraries.length != expected_size){
       throw "Expected to retrieve " + expected_size + " libraries, but got " + pool_libraries.length + "\n";
    }
  
	// 3
    var projects_in_run = run_entry.getFieldValues(ILLUMINA_RUN["Project"]);
    if(!is_in_list(pool_project, projects_in_run)){
        // This is more of a sanity check than anything.
     	throw "Adding pool " + pool_name + " from " + pool_project + ", but that project is not selected.\n"; 
    }
  
    // 4
    for(var row_idx=0; row_idx<lane_subtable_len; row_idx++){
        row_library = run_entry.getSubtableFieldValue(lane_subtable["_id"], row_idx, lane_subtable["Library"]);
        
      	if(is_in_list(row_library, pool_libraries)){
         	throw "Trying to add library " + row_library + " to " + lane_name + ", but it is already there.\n";
        }
    }
  
    // 5 looks similar to the pool updater loop in illumina_run_poolman
    for (var i=0; i<pool_libraries.length; i++){
        // As usual, add the items in reversed order to get them in the expected order.
        var _i = pool_libraries.length-(i+1);
        var pool_library = pool_libraries[_i];

        run_entry.setSubtableFieldValue(lane_subtable["Pool"],    new_row_idx, pool_name);
        run_entry.setSubtableFieldValue(lane_subtable["Library"], new_row_idx, pool_library);
        
        new_row_idx -= 1;
    }
  
  	// We need to ensure that new_row_idx does not clash if we add multiple pools to a lane,
    // so return the next available value.
    return new_row_idx;
}

function illumina_run_poolman(){
  	/* This function implements the "Add pools to lanes" feature, by looking
     * to see which (if any) pools were selected and adding them to the appropriate
     * lanes.
     * It will then re-generate the table of pools based upon the list of projects
     * selected for the run.
     * ** The example at https://www.ragic.com/intl/en/doc/15/javascript-workflow-engine#5
     * ** is pertinent!
     */

  	// 1 - get the just-saved record
    var run_entry = param.getUpdatedEntry();
    var projects_in_run = run_entry.getFieldValues(ILLUMINA_RUN["Project"]);
    var pool_subtable_len = run_entry.getSubtableSize(POOL_SUBTABLE["_id"]);

    // 2 - add selected pools to lanes
    var pools_added = 0;
    var next_insertion_idx = -1; // We need to ensure the index of added rows is unique.
    for(var row_idx=0; row_idx<pool_subtable_len; row_idx++){
        var _row_idx = pool_subtable_len - (row_idx+1); // Traverse in reverse.
      
        row_project = run_entry.getSubtableFieldValue(POOL_SUBTABLE["_id"], _row_idx, POOL_SUBTABLE["Project"]);
        row_pool_name = run_entry.getSubtableFieldValue(POOL_SUBTABLE["_id"], _row_idx, POOL_SUBTABLE["Pool"]);
        row_pool_size = run_entry.getSubtableFieldValue(POOL_SUBTABLE["_id"], _row_idx, POOL_SUBTABLE["Samples in Pool"]);
      	row_select = select_to_lanes(run_entry.getSubtableFieldValue(POOL_SUBTABLE["_id"], _row_idx, POOL_SUBTABLE["Select"]));
      
        // Add this pool to the lanes. In most cases row_select will be [] and nothing will happen.
        for(var selectidx=0; selectidx<row_select.length; selectidx++){
        	next_insertion_idx = add_pool_to_lane(run_entry, row_project, row_pool_name, row_pool_size, row_select[selectidx], next_insertion_idx);
            pools_added += 1;
        }
    }
  
    // 3 - re-generate the pools table   
  	var pools_list = pools_for_projects(projects_in_run);
    var total_new_entries = 0;
	for (var aproject_name in pools_list){
       total_new_entries += Object.keys(pools_list[aproject_name]).length;
    }
  
  	log.println("Loaded info about " + total_new_entries + " pools");
  
    /* DELETEME
    // At this point I may need to debug pools_for_projects():
    log.println("Dumping projects_in_run...");
    log.println(JSON.stringify(projects_in_run));
    log.println("Dumping pools_list...");
    log.println(JSON.stringify(pools_list));
    log.println("and quitting...");
    return;
    */
  
    // Is there any need to avoid the update if nothing has changed? It's probably
    // a good idea. So do it.
    var pools_updated = false;

  	if(total_new_entries != pool_subtable_len){
        // Clearly there is a change.
        pools_updated = true;
    }else{
        var old_row_idx = 0;
      
    	// We need to scan for changes.
        for (var aproject_name in pools_list){
            var aproject_pools = pools_list[aproject_name];

            for (var apool_name in aproject_pools){
                var apool_size = aproject_pools[apool_name];

              	// Note - When querying (as opposed to updating) we only need the rown number, not the node_id

                // What happens if I hit the blank lines at the end? Doesn't matter, since I
                // did the explicit size check above. Check all four fields so we pick up selection
                // changes too.
                pools_updated = pools_updated || (
                		run_entry.getSubtableFieldValue(POOL_SUBTABLE["_id"], old_row_idx, POOL_SUBTABLE["Project"]) != aproject_name ||
	                	run_entry.getSubtableFieldValue(POOL_SUBTABLE["_id"], old_row_idx, POOL_SUBTABLE["Pool"]) != apool_name ||
                		run_entry.getSubtableFieldValue(POOL_SUBTABLE["_id"], old_row_idx, POOL_SUBTABLE["Samples in Pool"]) != apool_size ||
	                	run_entry.getSubtableFieldValue(POOL_SUBTABLE["_id"], old_row_idx, POOL_SUBTABLE["Select"]) != POOL_SUBTABLE["Select-label"]
                    );
              
                old_row_idx += 1;
            }
        }
    }    
    
    if(pools_updated){
        // No reason not to clear and re-add everything.
        run_entry.deleteSubtableRowAll(POOL_SUBTABLE["_id"]);
        var new_row_idx = 0-total_new_entries; // This adds rows in the right order??
        for (var aproject_name in pools_list){
            var aproject_pools = pools_list[aproject_name];

            for (var apool_name in aproject_pools){
                var apool_size = aproject_pools[apool_name];

                run_entry.setSubtableFieldValue(POOL_SUBTABLE["Project"],         new_row_idx, aproject_name);
                run_entry.setSubtableFieldValue(POOL_SUBTABLE["Pool"],            new_row_idx, apool_name); 
                run_entry.setSubtableFieldValue(POOL_SUBTABLE["Samples in Pool"], new_row_idx, apool_size);
                run_entry.setSubtableFieldValue(POOL_SUBTABLE["Select"],          new_row_idx, POOL_SUBTABLE["Select-label"]);

                new_row_idx += 1;
            }
        }
        log.println("Added " + total_new_entries + " pools and new_row_idx is " + new_row_idx + " (should be always 0)");

        run_entry.save(); 
    }else{
      	log.println("Not re-generating the pools table as nothing has changed.");
    }
}


