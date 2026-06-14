import { SQLDialect } from '@codemirror/lang-sql'

/**
 * Spark SQL 3.5 dialect for CodeMirror.
 * Includes Spark-specific keywords, built-in functions, and data types.
 */
export const SparkSQL: SQLDialect = SQLDialect.define({
    // Standard SQL keywords + Spark-specific ones
    keywords:
        // Standard SQL
        'select from where and or not in is null as on join left right inner outer full cross ' +
        'group by order asc desc having limit offset union all distinct case when then else end ' +
        'insert into values update delete create drop alter table view index if exists ' +
        'between like exists set cast with recursive true false default primary key foreign references ' +
        'constraint unique check count sum avg min max coalesce nullif ' +
        // Spark-specific keywords
        'lateral view explode outer distribute by cluster by sort by ' +
        'tablesample pivot unpivot transform using ' +
        'partition partitioned by partitions repartition coalesce ' +
        'cache uncache lazy table refresh temporary temp global local ' +
        'format options stored tblproperties location comment ' +
        'overwrite directory truncate describe show databases tables columns functions ' +
        'msck repair analyze compute statistics noscan for ' +
        'skewed stored as directories ' +
        'window over rows range unbounded preceding following current row ' +
        'first last ignore nulls respect ' +
        'rollup cube grouping sets ' +
        'except intersect minus ' +
        'anti semi ' +
        'qualify ilike rlike regexp ' +
        'add jar file archive list ' +
        'explain extended codegen cost formatted logical ' +
        'use database schema catalog ' +
        'grant revoke deny role admin ' +
        'lock unlock share exclusive mode wait nowait locks ' +
        'delta merge matched ' +
        'fetch next only percent ties ',

    // Built-in functions
    builtin:
        // Aggregate functions
        'count sum avg min max first last collect_list collect_set ' +
        'count_distinct approx_count_distinct percentile percentile_approx ' +
        'stddev stddev_pop stddev_samp variance var_pop var_samp ' +
        'skewness kurtosis any_value bit_and bit_or bit_xor bool_and bool_or ' +
        'corr covar_pop covar_samp count_if every some ' +
        'max_by min_by ' +
        // Window functions
        'row_number rank dense_rank ntile lag lead ' +
        'cume_dist percent_rank first_value last_value nth_value ' +
        // String functions
        'concat concat_ws substring substr trim ltrim rtrim ' +
        'upper lower lcase ucase length char_length character_length ' +
        'lpad rpad repeat reverse replace translate ' +
        'regexp_replace regexp_extract regexp_extract_all ' +
        'split instr locate position ' +
        'format_string format_number printf ' +
        'initcap ascii chr char ' +
        'base64 unbase64 decode encode ' +
        'left right overlay ' +
        'soundex levenshtein sentences ' +
        'parse_url url_decode url_encode ' +
        'btrim ' +
        // Date/time functions
        'current_date current_timestamp now ' +
        'date_format date_add date_sub datediff months_between ' +
        'add_months last_day next_day trunc date_trunc ' +
        'year month day dayofweek dayofmonth dayofyear ' +
        'hour minute second quarter weekofyear ' +
        'from_unixtime unix_timestamp ' +
        'to_date to_timestamp to_utc_timestamp from_utc_timestamp ' +
        'make_date make_timestamp make_interval ' +
        'extract date_part timestamp_seconds timestamp_millis timestamp_micros ' +
        'window session_window ' +
        // Math functions
        'abs ceil ceiling floor round bround ' +
        'exp log log2 log10 ln pow power sqrt cbrt ' +
        'sign signum positive negative ' +
        'sin cos tan asin acos atan atan2 ' +
        'degrees radians pi e ' +
        'factorial hex unhex bin oct conv ' +
        'pmod mod greatest least ' +
        'rand randn random ' +
        'crc32 hash xxhash64 md5 sha sha1 sha2 ' +
        'width_bucket ' +
        // Collection functions
        'array array_contains array_distinct array_except array_intersect ' +
        'array_join array_max array_min array_position array_remove array_repeat ' +
        'array_sort array_union arrays_overlap arrays_zip ' +
        'flatten sequence shuffle slice sort_array ' +
        'element_at size cardinality ' +
        'map map_from_arrays map_from_entries map_keys map_values map_entries ' +
        'map_concat map_filter map_zip_with ' +
        'transform transform_keys transform_values ' +
        'filter aggregate zip_with ' +
        'explode explode_outer posexplode posexplode_outer inline inline_outer ' +
        'stack ' +
        // JSON functions
        'from_json to_json schema_of_json json_tuple get_json_object json_object_keys ' +
        'json_array_length ' +
        // Type functions
        'cast typeof ' +
        'bigint int smallint tinyint float double decimal ' +
        'boolean string binary date timestamp ' +
        // Conditional functions
        'if ifnull nullif nvl nvl2 coalesce ' +
        'nanvl isnan isnull isnotnull ' +
        'assert_true raise_error ' +
        // Misc functions
        'spark_partition_id input_file_name input_file_block_start input_file_block_length ' +
        'monotonically_increasing_id current_user current_catalog current_database ' +
        'uuid reflect java_method ' +
        'version typeof ' +
        'struct named_struct create_map create_union ' +
        'encode decode ' +
        'xpath xpath_boolean xpath_double xpath_float xpath_int xpath_long xpath_number xpath_short xpath_string ' +
        'raise_error elt field find_in_set ' +
        'grouping grouping_id ' +
        'cube rollup ',

    // Spark SQL types
    types:
        'boolean tinyint smallint int integer bigint float real double ' +
        'decimal dec numeric ' +
        'string varchar char ' +
        'binary ' +
        'date timestamp timestamp_ntz timestamp_ltz ' +
        'interval ' +
        'array map struct ' +
        'void ',

    // Operator characters
    operatorChars: '*+-%<>!=&|~^/',

    // Spark uses backtick for quoting identifiers
    specialVar: '`',
    identifierQuotes: '`',

    // Support -- and /* */ comments
    hashComments: false,
    slashComments: true,

    // Spark is case-insensitive for keywords
    caseInsensitiveIdentifiers: true,
})
