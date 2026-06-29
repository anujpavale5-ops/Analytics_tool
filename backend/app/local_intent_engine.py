import re
from rapidfuzz import fuzz

def normalize_text(text: str) -> str:
    text = text.lower()
    filler_words = ["can", "you", "could", "please", "show", "give", "display", "tell", "me", "the", "a", "an", "what", "is", "are"]
    for word in filler_words:
        text = re.sub(rf'\b{word}\b', '', text)
    # Remove extra spaces
    text = re.sub(r'\s+', ' ', text).strip()
    return text

METRICS = {
    "avg": ["average", "avg", "mean", "typical"],
    "sum": ["sum", "total", "overall", "combined", "aggregate"],
    "count": ["count", "number of", "how many", "records"],
    "max": ["highest", "maximum", "largest", "top", "best", "peak", "greatest", "max"],
    "min": ["lowest", "minimum", "smallest", "bottom", "least", "worst", "min"]
}

def parse_local_intent(question: str, schema: dict, semantic_index: dict, learned_aliases: dict) -> dict:
    normalized = normalize_text(question)
    
    intent = {
        "table": None,
        "metric": "raw",
        "column": "*",
        "group_by": None,
        "filters": [],
        "sort": None,
        "limit": None,
        "has_distribution_keyword": False,
        "confidence": 0
    }
    
    confidence = 0
    
    # 0. Distribution keywords
    dist_keywords = ["distribution", "share", "percentage", "composition"]
    for keyword in dist_keywords:
        if re.search(rf'\b{keyword}\b', normalized):
            intent["has_distribution_keyword"] = True
            break
            
    # 0.5 Top/Bottom N
    top_match = re.search(r'\btop\s+(\d+)\b', normalized)
    if top_match:
        intent["limit"] = int(top_match.group(1))
        intent["sort"] = "DESC"
        confidence += 10
        
    bottom_match = re.search(r'\b(?:bottom|lowest|worst)\s+(\d+)\b', normalized)
    if bottom_match:
        intent["limit"] = int(bottom_match.group(1))
        intent["sort"] = "ASC"
        confidence += 10
    
    # 1. Identify Metric
    found_metric = False
    for metric_key, aliases in METRICS.items():
        for alias in aliases:
            if re.search(rf'\b{alias}\b', normalized):
                intent["metric"] = metric_key
                confidence += 30
                found_metric = True
                break
        if found_metric: break
        
    # 2. Gather all columns
    all_columns = []
    col_to_table = {}
    for table, cols in schema.items():
        if not intent["table"]:
            intent["table"] = table # default to first table
        for c in cols:
            all_columns.append(c["name"])
            col_to_table[c["name"]] = table
            
    if not all_columns:
        return intent

    def resolve_column(phrase: str):
        """Attempts to resolve a phrase into a schema column."""
        # 1. Check learned aliases (highest priority)
        if learned_aliases and phrase in learned_aliases:
            return learned_aliases[phrase]
            
        # 2. Check semantic index
        if semantic_index and phrase in semantic_index:
            return semantic_index[phrase]
            
        # 3. Check exact column match
        if phrase in all_columns:
            return phrase
            
        # 4. Fuzzy match against all columns
        best_match = None
        best_score = 0
        for col in all_columns:
            score = fuzz.ratio(phrase, col)
            if score > best_score:
                best_score = score
                best_match = col
        if best_score > 85:
            return best_match
            
        return None

    # 3. Identify Group By
    group_by_match = re.search(r'\b(?:by|per|group by|split by|for each|each)\s+([a-z0-9_\s]+)', normalized)
    group_phrase = None
    if group_by_match:
        group_phrase = group_by_match.group(1).strip()
        # Clean up any trailing words that might not be the group name
        group_phrase_words = group_phrase.split()
        
        # We try to match incrementally (e.g. "department", "department name")
        # Try full phrase first
        resolved_group = resolve_column(group_phrase)
        if not resolved_group and len(group_phrase_words) > 0:
            # Fallback to first word
            resolved_group = resolve_column(group_phrase_words[0])
            
        if resolved_group:
            intent["group_by"] = resolved_group
            confidence += 20
            # Ensure table matches the group_by col
            intent["table"] = col_to_table.get(resolved_group, intent["table"])

    # 4. Identify Target Column
    # Remove group phrase from normalized text to avoid matching it as the target column
    if group_phrase:
        normalized_without_group = normalized.replace(group_phrase, '')
    else:
        normalized_without_group = normalized
        
    words = normalized_without_group.split()
    found_col = False
    
    # Try bi-grams first, then uni-grams
    bigrams = [' '.join(words[i:i+2]) for i in range(len(words)-1)]
    for phrase in bigrams + words:
        # Ignore metric words
        is_metric_word = False
        for metric_aliases in METRICS.values():
            if phrase in metric_aliases:
                is_metric_word = True
                break
        if is_metric_word: continue
        
        resolved = resolve_column(phrase)
        if resolved:
            intent["column"] = resolved
            confidence += 30
            found_col = True
            intent["table"] = col_to_table.get(resolved, intent["table"])
            break

    # If it's a count query and no column found, that's fine
    if intent["metric"] == "count" and not found_col:
        intent["column"] = "*"
        confidence += 30
        found_col = True

    # 5. Pattern Match Bonus
    if found_metric and found_col:
        confidence += 20
        
    intent["confidence"] = confidence
    return intent
