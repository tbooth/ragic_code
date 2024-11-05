/* Barcode collision detection in JS5
 *
 * Doing this correctly is a bit fiddly, but I believe worth it.
 */
"use strict";

// Test data - see test runs at the end.
var all_tests = {};

all_tests['one_code']       = { c: ['AAAA'], e: 4 };
all_tests['single_good']    = { c: ['AAAA', 'TTTT', 'CCCC', 'GGGG'], e: 4 };
all_tests['single_bad']     = { c: ['AAAA', 'TTTT', 'CCCC', 'AAAT'], e: 1 };
all_tests['single_verybad'] = { c: ['AAAA', 'TTTT', 'CCCC', 'AAAA'], e: 0 };

/* I did some testing with bcl2fastq, and the rule for dual barcodes is that
 * when comparing a pair of codes you compare i1's and separately compare i2's and then
 * return the max diff. Which is pretty simple.
 */

/* Also I need to decide what to do with barcodes the same length?
 *
 * 1) Insist that all must be the same length?
 * 2) Do the whole check as if all codes were the length of the shortest code?
 * 3) Calculate hamming distance based on the shorter of all pairs?
 *
 * 3 is what we have historically done but bcl2fastq never supported it. 2 is
 * more realistic as it assures us we can just ignore some index cycles.
 */

all_tests['dual_good1'] = { c: ['AAAA+AAAA', 'TTTT+TTTT', 'CCCC+GGGG'], e: 4 };
all_tests['dual_good2'] = { c: ['AAAA+AAAA', 'AAAA+TTTT', 'CCCC+GGGG'], e: 4 }; // still 4
all_tests['dual_bad']   = { c: ['AAAA+AAAA', 'AAAA+AAAT', 'CCCC+GGGG'], e: 1 };
all_tests['dual_erm1']  = { c: ['AAAA+AAAA', 'AAAT+ATTT', 'CCCC+GGGG'], e: 3 }; // (ie. good)
all_tests['dual_erm2']  = { c: ['AAAA+AAAA', 'AATT+AATT', 'CCCC+GGGG'], e: 2 }; // (ie. bad)

// Weird stuff
all_tests['empty'] = { c: [], e: -1 }; // Returning -1 from an empty list seems reasonable.

all_tests['funky_lengths'] = { c: ['AAA+AAA', 'TT+TTTT', 'CCCC'], e: 2 };

function min_hamming(bc_list){
    /* Main function that takes any list of barcodes and yields the min hamming
     * distance as per bcl2fastq logic.
     * If the lengths of the codes are not all the same, all codes will be
     * compared at the length of the shortest code.
     */
    // We don't need a special case for empty or single item lists - it just comes out in
    // the wash :-)

    // Get the index lengths.
    var min_idx_lens = min_index_len(bc_list);

    // Now the minimum hamming distance starts off as the longer of these two.
    // If there is only one sequence this will be the correct final result.
    var min_hamming = Math.max.apply(Math, min_idx_lens);

    // Generate all combinations of codes and look for worse results.
    for(var i0 = 0; i0 < bc_list.length; i0++){
        for(var i1 = i0+1; i1 < bc_list.length; i1++){
            //println("Comparing " + bc_list[i0] + " with " + bc_list[i1]);
            var hd = hamming_dist( bc_list[i0],     bc_list[i1],
                                   min_idx_lens[0], min_idx_lens[1] );
            //println("Got " + hd);
            if(hd < min_hamming){
                min_hamming = hd;
            };
        };
    };

    return min_hamming;
}

function min_index_len(bc_list){
    /* Find the min length of index1 and index2 in bc_list
     * Return a 2-item array in all cases.
     */
    var min_idx_len = [-1, -1];

    for(var idxn=0; idxn<min_idx_len.length; idxn++){
        for(var bcn=0; bcn<bc_list.length; bcn++){
            var idx_len = index_split(bc_list[bcn])[idxn].length;
            if(min_idx_len[idxn] < 0 || min_idx_len[idxn] > idx_len){
                min_idx_len[idxn] = idx_len;
            }
        }
    }

    return min_idx_len;
}

function index_split(idx){
    /* Split a barcode in two parts.
     * eg: "ATAT+GCGC" => ["ATAT", "GCGC"]
     *     "AGAGAG" => [AGAGAG", ""]
     */
    var idx_arr = idx.split('+');
    if(idx_arr.length == 1){
        idx_arr[1] = '';
    }
    else if(idx_arr.length > 2){
        throw "Bad barcode: " + idx;
    }
    return idx_arr;
}

function hamming_dist(bc1, bc2, comp_len0, comp_len1){
    /* Compares two barcodes, and reports the hamming distance.
     * The idx1 and idx2 will be compared separately and the higher of the two
     * be reported. For single-index codes comp_len0 should be 0 and it
     * all works out.
     */
    // Normalize both codes into [index1, index2] and trim them before comparison.
    var bc1_split = index_split(bc1);
    bc1_split[0] = bc1_split[0].substring(0, comp_len0);
    bc1_split[1] = bc1_split[1].substring(0, comp_len1);

    var bc2_split = index_split(bc2);
    bc2_split[0] = bc2_split[0].substring(0, comp_len0);
    bc2_split[1] = bc2_split[1].substring(0, comp_len1);

    // Compare characters in bc1_split[0] with bc2_split[0] and then
    // bc1_split[1] with bc2_split[1].
    var hdist = [0, 0];
    for(var i=0; i<hdist.length; i++){
        for(var ci=0; ci<bc1_split[i].length && ci<bc2_split[i].length; ci++){
            if(bc1_split[i].charAt(ci) != bc2_split[i].charAt(ci)){
                hdist[i] += 1;
            }
        }
    }

    // 3) Return the larger of the two numbers.
    return Math.max.apply(Math, hdist);
}

/****************************************************
 * Run the tests:
 ****************************************************/

println("Testing min_index_len() [0]");
if( JSON.stringify(min_index_len(['AAAAA', 'CCC'])) !=
    JSON.stringify([3,0]) ){
    throw "Failed: min_index_len(['AAAAA', 'CCC'])";
}
println("Testing min_index_len() [1]");
if( JSON.stringify(min_index_len(['AAAAA+AAAAA', 'CCC+CCC'])) !=
    JSON.stringify([3,3]) ){
    throw "Failed: min_index_len(['AAAAA+AAAAA', 'CCC+CCC'])";
}

for(var t=0; t<Object.keys(all_tests).length; t++){
    var k = Object.keys(all_tests)[t];
    var c = all_tests[k]['c'];
    var e = all_tests[k]['e'];

    println("Running test " + t + " on " + JSON.stringify(c) + " expecting " + e);
    var res = min_hamming(c);
    // Not sure where is the Assert in Nashorn?
    if(res != e){ throw "Fail! Got " + res; }
}
