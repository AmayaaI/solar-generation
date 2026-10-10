function pageLinks(req, page, limit, totalCount) {
  const totalPages = Math.ceil(totalCount / limit);
  const url = new URL(req.originalUrl, 'http://api.local');
  const makeLink = targetPage => {
    url.searchParams.set('page', String(targetPage));
    url.searchParams.set('limit', String(limit));
    return `${url.pathname}${url.search}`;
  };
  let previous = null;
  if (totalPages > 0 && page > 1) previous = makeLink(Math.min(page - 1, totalPages));
  const next = page < totalPages ? makeLink(page + 1) : null;
  return {
    pagination: { page, limit, totalCount, totalPages },
    links: { self: makeLink(page), next, previous }
  };
}

function collectionResponse(req, page, limit, totalCount, data) {
  return { data, ...pageLinks(req, page, limit, totalCount) };
}

module.exports = { pageLinks, collectionResponse };
