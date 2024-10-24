/**

 * This comment is auto generated on 2024/10/23 11:29:59, and it reflects the field definition at this given time.
 * If you need the current field definitions for your database, please go to "Start" => "Account Setup" => "DB Maintenance" => "Download Data Dictionary"

 * AP_Name:edgen
 * Key Field: 1000014

 * Pool subtable key: 1000015

 * Pool subtable key: 1000034

 * Pool subtable key: 1000035

 * Pool subtable key: 1000036

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
 * Lane 1 index revcomp   : 1000040
 * Pool                   : 1000024
 * Library                : 1000013
 * Lane 2 index revcomp   : 1000041
 * Lane 3 index revcomp   : 1000042
 * Lane 4 index revcomp   : 1000043
 * Pool                   : 1000028
 * Library                : 1000029
 * Pool                   : 1000030
 * Library                : 1000031
 * Pool                   : 1000032
 * Library                : 1000033
 * Investigator           : 1000039
 * Last Update            : 109

 */

var ILLUMINA_RUN = { "_path":  "/sequencing/2",
                     "_id":    1000014,
                     "project" 1000020 };

// TODO - I can make this data structure a lot neater!
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
                                  "Library": 1000033} }

var POOL_SUBTABLE = { "_id": 1000056,
                      "Project": 1000052,
                      "Pool": 1000053,
                      "Samples in Pool": 1000054,
                      "Add to Lane": 1000055 }


function scan_lanes(record_id){
  /* We need debugging messages */
  log.setToConsole(true); // Display the console block
  log.println("==========");
  log.println("running: scan_lanes(" + record_id +" )");
  
  // More tinkering - log and db are globals imported from Java with Java.type(),
  // and as such we can call Java introspection methods on them.
  /*
  log.println(typeof log);
  var m = log.class.getDeclaredMethods();                                                    
  for (var i = 0; i < m.length; i++){                                                             
     log.println(m[i].toString());                                                                   
  } 
  */
  // We can say what line we are on.
  /*
  log.println("This is code line " + __LINE__);
  return;
  */
  
  var query = db.getAPIQuery(ILLUMINA_RUN["_path"]);
  var entry = query.getAPIEntry(record_id);
  
  log.println(entry);
  
  // we need to get the first row in the fourth subtable
  
  // actually, get the size of all the subtables
  for (var i in LANE_SUBTABLES){
    var subtable_dict = ALL_LANE_SUBTABLES[i];
    var subtable_id = subtable_dict["_id"];
    log.println("Looking at " + i + " = " + subtable_id);
    
    var total_entries = entry.getSubtableSize(subtable_id);
    log.println("Total entries " + total_entries);
    
    // Seems that row IDs for this function are zero indexed
  	var first_row = entry.getSubtableRootNodeId(subtable_id, 0);
  	log.println("First row nodeid is " + first_row);
    var last_row = entry.getSubtableRootNodeId(subtable_id, total_entries-1);
    log.println("Last row nodeid is " + last_row);
  }

  // And finally, how to raise an alert with an exception?
  throw "Something awful happened\n";
  // Or I can use showMsg(), apparently.
}

function add_pool(record_id){
  // This is now moved to a post update action.
  
  /* We need debugging messages */
  log.setToConsole(true); // Display the console block
  log.println("==========");
  log.println("running: add_pool(" + record_id +" )");
  
  
  var query = db.getAPIQuery(ILLUMINA_RUN["_path"]);
  var entry = query.getAPIEntry(record_id);

  // Add the two cells separately. Note that these setters do not return a value.
  entry.setSubtableFieldValue(LANE_SUBTABLES['Lane 4']['Pool'], -1, "test_pool");
  entry.setSubtableFieldValue(LANE_SUBTABLES['Lane 4']['Library'], -1, "33472TD00001L01"); 
  log.println(entry.save().getMessage());  // Should be ' '
}

function clear_all(record_id){
  /* Clear all the entries in all the lanes */  
  log.setToConsole(true); // Choose if we display the console block
  log.println("==========");
  log.println("running: clear_all(" + record_id +" )");

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

function illumina_run_poolman(){
  
  	/* This function implements the "Add pools to lanes" feature, by looking
       to see which (if any) pools were selected and adding them to the appropriate
       lanes.
       It will then re-generate the table of pools based upon the list of projects
       selected for the run.
       ** The example at https://www.ragic.com/intl/en/doc/15/javascript-workflow-engine#5
       ** is pertinent!
    */

  	// 1 - get the just-saved record
    // Version in the example code:
    //var run_query = db.getAPIQuery(ILLUMINA_RUN["_path"]);
    //var run_entry = query.getAPIEntry(param.getNewNodeId(ILLUMINA_RUN["_id"]));
    // Easier version!
    var run_entry = param.getUpdatedEntry();
  
    var projects_in_run = param.getNewValues(ILLUMINA_RUN["Project"]);
  
    // 2 - add selected pools to lanes 
    // TODO TODO TODO
    // Sanity check the pool size matches
    // Sanity check the project is still in the list
    // Sanity check adding a pool twice
   
    // 3 - re-generate the pools table
    // TODO - is there any need to avoid the update if nothing has changed? It's probably
    // a good idea.
  
	var all_pools_subtable = param.getSubtableEntry(1000056);
  	log.println(all_pools_subtable);
  
    for(var i=0; i < all_pools_subtable.length; i++){
      	log.println(all_pools_subtable[i].getOldValue(1000052));
       	log.println(all_pools_subtable[i].getNewValue(1000052));
        log.println(all_pools_subtable[i].getOldNodeId(1000052));
        log.println(all_pools_subtable[i].getNewNodeId(1000052));
    }
  
    // I think trying to get the record for the NewNodeId will fail as it is not saved yet?
    var query = db.getAPIQuery(ILLUMINA_RUN);

	var entry = query.getAPIEntry(param.getNewNodeId(1000014));
	var subtableSize = entry.getSubtableSize(1000036);
    log.println("Lane 4 has " + subtableSize + " entries");
}

