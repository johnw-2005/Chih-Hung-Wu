



export const awardCategories = ['best-paper', 'thesis', 'competition']         ;


export const awardCategoryAccent                                = {
  'best-paper': 'cat-indigo',
  thesis: 'cat-purple',
  competition: 'cat-amber',
};

export const awardCategoryShortLabel                                = {
  'best-paper': '最佳論文',
  thesis: '碩博論文',
  competition: '競賽獲獎',
};








const BEST_PAPER_RE = /,?\s*Best Paper Award\s*\.?\s*$/i;
const BEST_THESIS_RE = /,?\s*Best Student Thesis Award\s*,?\s*\d{4}\.?\s*$/i;
const ORG_SPLIT_RE = /(?=(?:指導|主辦|承辦|補助|合辦|執行)\s*單位\s*[:：])/;
const ORG_LABEL_RE = /(?:指導|主辦|承辦|補助|合辦|執行)\s*單位\s*[:：]/;

const COMPETITION_AWARD_PATTERNS           = [
  /[」"]\s*[,，]?\s*(?:兩組\s+)?通過認證關卡\s*[,，]?\s*(?:，獲得)?\s*(.+)$/,
  /[」"]\s*[,，]?\s*(?:分別)?榮獲\s+(.+)$/,
  /」競賽[，,]\s*(.+)$/,
  /」--\s*(.+)$/,
  /-\s*(全國.+)$/,
  /，\s*榮獲\s+(.+)$/,
  /，\s*(.+?)\s*榮獲\s+(.+)$/,
  /[」"]\s*[,，]?\s*(.+[獎名次軍季冠亞佳].*)$/,
];

function cleanAwardText(text        )         {
  return text
    .replace(/^榮獲\s*/, '')
    .replace(/\s+/g, ' ')
    .replace(/[。.\s]+$/, '')
    .replace(/^[,，、\s]+/, '')
    .trim();
}

function stripCompetitionContext(title        , awardLabel        )         {
  const idx = title.lastIndexOf(awardLabel);
  if (idx > 0) {
    return title
      .slice(0, idx)
      .replace(/[,，]?\s*(?:分別)?榮獲\s*$/, '')
      .replace(/[,，]?\s*獲得\s*$/, '')
      .replace(/[,，]?\s*通過認證關卡\s*$/, '')
      .replace(/[,，]?\s*競賽\s*$/, '')
      .replace(/[,，]?\s*--\s*$/, '')
      .replace(/[-–]\s*$/, '')
      .replace(/[。.\s]+$/, '')
      .trim();
  }
  return title;
}

function extractParenBlock(text        , openIndex        )                                        {
  let depth = 0;
  for (let i = openIndex; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') {
      depth--;
      if (depth === 0) return { inner: text.slice(openIndex + 1, i), end: i };
    }
  }
  return null;
}

function cleanCompetitionName(name        )         {
  return name
    .replace(/^[「「\s]+/, '')
    .replace(/[」」\s]+$/, '')
    .replace(/^(\d{4})年/, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanSuffix(suffix        )         {
  return suffix
    .replace(/^[」」\s]+/, '')
    .replace(/^競賽\s*$/, '')
    .replace(/[,，]\s*$/, '')
    .trim();
}

function parseOrganizerLines(organizerText        )           {
  const detailLines           = [];
  for (const part of organizerText.split(ORG_SPLIT_RE).filter(Boolean)) {
    const match = part.match(/^(指導|主辦|承辦|補助|合辦|執行)\s*單位\s*[:：]\s*(.+)$/);
    if (match) {
      detailLines.push(`${match[1]}單位：${match[2].replace(/[,，]\s*$/, '').trim()}`);
    }
  }
  return detailLines;
}

/** 將競賽描述整理為簡潔標題與主辦資訊 */
export function formatCompetitionTitle(context        )                                               {
  let text = context
    .replace(/\s+/g, ' ')
    .replace(/[（]/g, '(')
    .replace(/[）]/g, ')')
    .replace(/^\d{4}\s*年\s*/, '')
    .replace(/^參加\s*/, '')
    .replace(/^[「「\s]+/, '')
    .replace(/[」」]\s*[,，]?\s*$/, '')
    .replace(/[」」]\s*競賽\s*[,，]?\s*$/, '')
    .replace(/[「「][^」」]*$/, '')
    .replace(/[,，]\s*$/, '')
    .trim();

  let teamEntry                    ;
  const quotedTailMatch = text.match(/^(.+?)[」」]\s*[,，]?\s*(.+)$/);
  if (quotedTailMatch && !ORG_LABEL_RE.test(text)) {
    text = quotedTailMatch[1].trim();
    const extra = quotedTailMatch[2].replace(/[,，]\s*$/, '').trim();
    if (extra && !/(榮獲|獲得|通過)/.test(extra)) {
      teamEntry = extra;
    }
  }

  let venue                    ;
  const venueMatch = text.match(/[」」]?\s*\(([^)]+場次)\)\s*$/);
  if (venueMatch?.index !== undefined) {
    venue = venueMatch[1].trim();
    text = text.slice(0, venueMatch.index).replace(/[」」]\s*$/, '').trim();
  }

  let competitionName = text;
  let suffix = '';
  const detailLines           = [];
  const orgStart = text.search(ORG_LABEL_RE);

  if (orgStart !== -1) {
    const parenStart = text.lastIndexOf('(', orgStart);
    if (parenStart !== -1) {
      const block = extractParenBlock(text, parenStart);
      if (block) {
        competitionName = text.slice(0, parenStart).trim();
        suffix = cleanSuffix(text.slice(block.end + 1));
        detailLines.push(...parseOrganizerLines(block.inner));
      }
    }
  }

  competitionName = cleanCompetitionName(competitionName);

  if (suffix && !/(榮獲|獲得|通過)/.test(suffix)) {
    if (/^ICAL\s/i.test(suffix) || suffix.includes('HOME ROBOT')) {
      detailLines.unshift(`參賽作品：${suffix}`);
    } else {
      competitionName = `${competitionName} · ${suffix}`;
    }
  }

  if (teamEntry) detailLines.unshift(`參賽作品：${teamEntry}`);

  if (venue) detailLines.push(`場次：${venue}`);

  return {
    displayTitle: competitionName,
    detail: detailLines.length > 0 ? detailLines.join('\n') : undefined,
  };
}

function buildCompetitionResult(awardLabel        , context        )              {
  const formatted = formatCompetitionTitle(context);
  return {
    category: 'competition',
    awardLabel,
    ...formatted,
  };
}

function parseCompetitionAward(title        )                     {
  for (const pattern of COMPETITION_AWARD_PATTERNS) {
    const match = title.match(pattern);
    if (!match) continue;

    const rawAward = match[match.length - 1] ?? '';
    const awardLabel = cleanAwardText(rawAward);
    if (!awardLabel || awardLabel.length < 2) continue;
    if (/^\(.+場次\)/.test(awardLabel)) continue;

    return buildCompetitionResult(awardLabel, stripCompetitionContext(title, rawAward));
  }

  const fallback = title.match(/(?:榮獲|獲得)\s+(.+)$/);
  if (fallback?.[1]) {
    const awardLabel = cleanAwardText(fallback[1]);
    if (awardLabel.length >= 2) {
      const context = title.slice(0, fallback.index).replace(/[,，]\s*$/, '').trim();
      return buildCompetitionResult(awardLabel, context);
    }
  }

  return null;
}

function looksLikeBestPaper(title        )          {
  return /^[A-Z][a-z].*\.( In | The \d)/.test(title) || /In Proceedings of/i.test(title);
}

/** 從標題或手動欄位解析獎項資訊 */
export function parseAwardEntry(title        , manualAward         )              {
  if (manualAward?.trim()) {
    const category = inferCategoryFromLabel(manualAward, title);
    if (category === 'competition') {
      const formatted = formatCompetitionTitle(title);
      return {
        category,
        awardLabel: manualAward.trim(),
        ...formatted,
      };
    }
    return {
      category,
      awardLabel: manualAward.trim(),
      displayTitle: title,
    };
  }

  if (BEST_THESIS_RE.test(title)) {
    return {
      category: 'thesis',
      awardLabel: 'Best Student Thesis Award',
      displayTitle: title.replace(BEST_THESIS_RE, '').replace(/[,\s.]+$/, '').trim(),
    };
  }

  if (BEST_PAPER_RE.test(title)) {
    return {
      category: 'best-paper',
      awardLabel: 'Best Paper Award',
      displayTitle: title.replace(BEST_PAPER_RE, '').replace(/[,\s.]+$/, '').trim(),
    };
  }

  const competition = parseCompetitionAward(title);
  if (competition) return competition;

  if (looksLikeBestPaper(title)) {
    return {
      category: 'best-paper',
      awardLabel: 'Best Paper Award',
      displayTitle: title,
    };
  }

  return {
    category: 'competition',
    awardLabel: '獲獎',
    ...formatCompetitionTitle(title),
  };
}

function inferCategoryFromLabel(award        , title        )                {
  if (/最佳論文|優良論文/.test(award)) return 'best-paper';
  if (/best\s+(paper|student\s+thesis)\s+award/i.test(award)) {
    return /thesis/i.test(award) ? 'thesis' : 'best-paper';
  }
  if (/best\s+paper/i.test(title)) return 'best-paper';
  if (/best\s+student\s+thesis/i.test(title)) return 'thesis';
  return 'competition';
}

export function resolveAwardCategory(item            )                {
  return parseAwardEntry(item.data.title, item.data.award).category;
}
