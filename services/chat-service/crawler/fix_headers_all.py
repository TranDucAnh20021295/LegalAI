import os
import sys
import re
from pathlib import Path

# Add current directory to path
sys.path.append(str(Path(__file__).parent.resolve()))
from md_utils import pick_primary_md

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')

TYPES = ["LUẬT", "NGHỊ ĐỊNH", "THÔNG TƯ", "QUYẾT ĐỊNH", "VĂN BẢN HỢP NHẤT", "NGHỊ QUYẾT", "CHỈ THỊ", "PHÁP LỆNH"]

def process_content(text):
    lines = text.splitlines()
    new_lines = list(lines)
    
    # We will search in the first 30 lines
    limit = min(30, len(lines))
    
    single_pattern = re.compile(r'^\s*(?:#\s+)?(' + '|'.join(TYPES) + r')\s*$', re.IGNORECASE)
    joined_pattern = re.compile(r'^\s*(?:#\s+)?(' + '|'.join(TYPES) + r')\s+(.+)$', re.IGNORECASE)
    
    stop_keywords = [
        r"^căn\s*cứ",
        r"^căn$",
        r"^cứ$",
        r"^nghị\s*định\s*số",
        r"^luật\s*số",
        r"^thông\s*tư\s*số",
        r"^quyết\s*định\s*số",
        r"^nghị\s*quyết\s*số",
        r"^số\s*:",
        r"^số\s*\d+",
        r"^hà\s*nội\s*,",
        r"^ngày\s+\d+\s+tháng",
        r"^quốc\s*hội\s*ban\s*hành",
        r"^chính\s*phủ\s*ban\s*hành",
        r"^theo\s*đề\s*nghị",
        r"^điều\s+\d+",
        r"^chương\s+[ivxldc]+",
        r"^#\s+chương",
        r"^##\s+điều"
    ]
    stop_pattern = re.compile('|'.join(stop_keywords), re.IGNORECASE)
    
    i = 0
    while i < limit:
        line = lines[i].strip()
        
        m_single = single_pattern.match(line)
        if m_single:
            doc_type = m_single.group(1).upper()
            
            title_parts = []
            j = i + 1
            last_title_line_idx = i
            
            while j < len(lines):
                line_j = lines[j].strip()
                
                if not line_j:
                    j += 1
                    continue
                
                if stop_pattern.match(line_j):
                    break
                    
                line_clean = re.sub(r'^#+\s*', '', line_j).strip()
                if stop_pattern.match(line_clean):
                    break
                
                title_parts.append(line_clean)
                last_title_line_idx = j
                j += 1
            
            if title_parts:
                title_full = " ".join(title_parts).strip()
                title_full = re.sub(r'\s+', ' ', title_full)
                
                replacement = f'<h1 align="center">{doc_type}<br>{title_full}</h1>'
                
                new_lines[i] = replacement
                for k in range(i + 1, last_title_line_idx + 1):
                    new_lines[k] = ""
                
                return "\n".join(new_lines), doc_type, title_full
        
        m_joined = joined_pattern.match(line)
        if m_joined:
            doc_type = m_joined.group(1).upper()
            title_text = m_joined.group(2).strip()
            
            if not stop_pattern.match(title_text):
                title_clean = re.sub(r'^#+\s*', '', title_text).strip()
                replacement = f'<h1 align="center">{doc_type}<br>{title_clean}</h1>'
                new_lines[i] = replacement
                return "\n".join(new_lines), doc_type, title_clean
                
        i += 1
        
    return text, None, None

def main():
    md_dir = Path("d:/project/LegalAI/LegalAISystem/legal-crawler/vbplmd/van_ban_moi")
    
    if not md_dir.exists():
        print(f"MD dir {md_dir} not exists")
        return
        
    folders = sorted([f for f in md_dir.iterdir() if f.is_dir()])
    
    updated_count = 0
    for folder in folders:
        primary = pick_primary_md(folder)
        if not primary:
            print(f"❌ {folder.name}: No primary MD found!")
            continue
            
        text = primary.read_text(encoding="utf-8", errors="replace")
        new_text, doc_type, title = process_content(text)
        
        if doc_type and new_text != text:
            # Save a backup of the original before modifying, just in case
            backup_path = primary.with_suffix(primary.suffix + ".orig")
            if not backup_path.exists():
                primary.write_text(text, encoding="utf-8")
                # Keep backup
                backup_path.write_text(text, encoding="utf-8")
                
            # Write modified content
            primary.write_text(new_text, encoding="utf-8")
            print(f"✅ Updated {folder.name} -> {doc_type}: {title[:50]}...")
            updated_count += 1
        else:
            print(f"ℹ️ Skipped {folder.name} (no changes or already processed)")
            
    print(f"\n🎉 Done! Updated {updated_count} files.")

if __name__ == '__main__':
    main()
