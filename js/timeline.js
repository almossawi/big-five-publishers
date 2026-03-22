(function() {
  var WIDTH = 1000;
  var NODE_WIDTH = 16;
  var NODE_PADDING = 15;
  var ANIM_MS = 600;
  var PLAY_MS = 1800;
  var PAD = 48;
  /** When the right controls pane is open, shrink viewBox height to remove extra whitespace below the diagram */
  var VIEWBOX_HEIGHT_TRIM_CONTROLS_OPEN = 40;
  var BAR_W = 8;
  var TRACK_SIDE = 10;

  var color = {
    PRH: '#ff8433',
    SS: '#cfab1c',
    Macmillan: '#c51039',
    HarperCollins: '#007cc4',
    Hachette: '#777777'
  };

  var publisherOrder = ['PRH', 'HarperCollins', 'Macmillan', 'SS', 'Hachette'];

  var publisherLabels = {
    PRH: 'Penguin Random House',
    HarperCollins: 'HarperCollins',
    Macmillan: 'Macmillan',
    SS: 'Simon & Schuster',
    Hachette: 'Hachette'
  };

  var timelineData = null;
  var allImprintEvents = [];
  var layouts = [];
  var maxHeights = {};
  var pubSnapshots = {};
  var currentPub = 'PRH';
  var currentSliderPos = -1;
  var currentSnapshotIndex = -1;
  var isPlaying = false;
  var playTimer = null;

  var svg, linksG, nodesG;

  d3.json('data/timeline.json').then(init);

  function init(data) {
    timelineData = data;
    buildAllImprintEvents();
    precomputeLayouts();
    computePubSnapshots();
    setupDOM();
    initControls();
    initImprintSearch();
    selectPublisher('PRH');
  }

  function computePubSnapshots() {
    publisherOrder.forEach(function(pub) {
      var indices = [0];
      timelineData.snapshots.forEach(function(snap, i) {
        if (i === 0) return;
        var hasChange = (snap.changes || []).some(function(c) {
          return c.publisher === pub;
        });
        if (hasChange) indices.push(i);
      });
      pubSnapshots[pub] = indices;
    });
  }

  function precomputeLayouts() {
    publisherOrder.forEach(function(pub) {
      var maxH = 300;
      timelineData.snapshots.forEach(function(snap) {
        if (!snap.publishers[pub]) return;
        var d = snap.publishers[pub];
        var targets = {};
        d.links.forEach(function(l) { targets[l.target] = true; });
        var leafCount = d.nodes.filter(function(n, i) { return !targets[i]; }).length;
        var h = leafCount * 10 + 40;
        if (h > maxH) maxH = h;
      });
      if (pub === 'PRH') maxH += 700;
      if (pub === 'HarperCollins') maxH += 230;
      if (pub === 'Macmillan') maxH += 230;
      if (pub === 'SS') maxH += 150;
      if (pub === 'Hachette') maxH += 350;
      maxHeights[pub] = maxH;
    });

    timelineData.snapshots.forEach(function(snap, i) {
      layouts[i] = {};
      publisherOrder.forEach(function(pub) {
        if (!snap.publishers[pub]) return;

        var nodes = snap.publishers[pub].nodes.map(function(d) {
          return Object.assign({}, d);
        });
        var links = snap.publishers[pub].links.map(function(d) {
          return Object.assign({}, d);
        });

        var layout = d3.sankey()
          .nodeWidth(NODE_WIDTH)
          .nodePadding(NODE_PADDING)
          .size([WIDTH, maxHeights[pub]]);

        layout.nodes(nodes).links(links).layout(32);

        nodes.forEach(function(n) {
          if (!n.name) { n._key = null; return; }
          if (n.targetLinks.length === 0 && n.sourceLinks.length === 0) {
            n._key = null;
            return;
          }
          var depth;
          if (n.targetLinks.length === 0) depth = 0;
          else if (n.sourceLinks.length === 0) depth = 2;
          else depth = 1;
          n._depth = depth;
          n._key = n.name + '|' + (n.imprint || '') + '|' + depth;
        });

        links.forEach(function(l) {
          l._key = (l.source._key && l.target._key)
            ? l.source._key + '>' + l.target._key
            : null;
        });

        layouts[i][pub] = { nodes: nodes, links: links };
      });
    });
  }

  function setupDOM() {
    svg = d3.select('#sankey-container').append('svg')
      .attr('preserveAspectRatio', 'xMidYMid meet');

    linksG = svg.append('g').attr('class', 'links-layer');
    nodesG = svg.append('g').attr('class', 'nodes-layer');
  }

  function positionThumb(pos) {
    var steps = pubSnapshots[currentPub];
    var n = steps.length;
    var thumb = document.getElementById('slider-thumb');
    var track = document.getElementById('slider-track');
    var wrap = document.querySelector('.slider-wrap');
    var W = wrap.offsetWidth || 1;
    var tw = track.offsetWidth || (W + 2 * TRACK_SIDE);
    if (n <= 1) {
      thumb.style.left = ((TRACK_SIDE / tw) * 100) + '%';
      return;
    }
    var f = pos / (n - 1);
    var xFromTrackLeft = f * W + TRACK_SIDE;
    thumb.style.left = (xFromTrackLeft / tw * 100) + '%';
  }

  function posFromMouse(e) {
    var track = document.getElementById('slider-track');
    var wrap = document.querySelector('.slider-wrap');
    var rect = track.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var W = wrap.offsetWidth || 1;
    var steps = pubSnapshots[currentPub];
    var n = steps.length;
    if (n <= 1) return 0;
    var f = (x - TRACK_SIDE) / W;
    f = Math.max(0, Math.min(1, f));
    return Math.round(f * (n - 1));
  }

  var CONTROLS_OPEN_KEY = 'timeline-controls-open';

  function controlsDrawerOpen() {
    return document.body.classList.contains('controls-open');
  }

  function movePubTabs(drawerOpen) {
    var tabs = document.getElementById('pub-tabs');
    var mainSlot = document.getElementById('pub-tabs-main-slot');
    var panelSlot = document.getElementById('pub-tabs-panel-slot');
    if (!tabs || !mainSlot || !panelSlot) return;
    (drawerOpen ? panelSlot : mainSlot).appendChild(tabs);
  }

  function setControlsOpen(open) {
    document.body.classList.toggle('controls-open', open);
    movePubTabs(open);
    var expandBtn = document.getElementById('controls-expand-btn');
    if (expandBtn) expandBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    var pageHeader = document.getElementById('timeline-page-header');
    if (pageHeader) pageHeader.setAttribute('aria-hidden', open ? 'true' : 'false');
    try {
      localStorage.setItem(CONTROLS_OPEN_KEY, open ? '1' : '0');
    } catch (err) { /* ignore */ }
    function reflowThumb() {
      positionThumb(currentSliderPos);
    }
    requestAnimationFrame(reflowThumb);
    setTimeout(reflowThumb, 50);
    setTimeout(reflowThumb, 280);
    setTimeout(function() {
      window.dispatchEvent(new Event('resize'));
    }, 320);
    if (timelineData && pubSnapshots[currentPub] && currentSliderPos >= 0) {
      var snapIdx = pubSnapshots[currentPub][currentSliderPos];
      renderSnapshot(snapIdx, false);
    }
  }

  function initControls() {
    var expandBtn = document.getElementById('controls-expand-btn');
    var collapseBtn = document.getElementById('controls-collapse-btn');
    if (expandBtn) {
      expandBtn.addEventListener('click', function() { setControlsOpen(true); });
    }
    if (collapseBtn) {
      collapseBtn.addEventListener('click', function() { setControlsOpen(false); });
    }
    try {
      /* Default: pane open. Only stay closed if user previously chose closed ('0'). */
      if (localStorage.getItem(CONTROLS_OPEN_KEY) !== '0') {
        document.body.classList.add('controls-open');
        if (expandBtn) expandBtn.setAttribute('aria-expanded', 'true');
        var ph = document.getElementById('timeline-page-header');
        if (ph) ph.setAttribute('aria-hidden', 'true');
      }
    } catch (err) {
      /* localStorage unavailable — still default to open */
      document.body.classList.add('controls-open');
      if (expandBtn) expandBtn.setAttribute('aria-expanded', 'true');
      var ph2 = document.getElementById('timeline-page-header');
      if (ph2) ph2.setAttribute('aria-hidden', 'true');
    }

    var sliderWrap = document.querySelector('.slider-wrap');
    var dragging = false;

    /* Same behavior as the track/thumb: entire column (padding + bars zone) is clickable */
    if (sliderWrap) {
      sliderWrap.addEventListener('mousedown', function(e) {
        dragging = true;
        var pos = posFromMouse(e);
        goToSliderPos(pos, true);
        positionThumb(pos);
        e.preventDefault();
      });
    }

    document.addEventListener('mousemove', function(e) {
      if (!dragging) return;
      var pos = posFromMouse(e);
      goToSliderPos(pos, true);
      positionThumb(pos);
    });

    document.addEventListener('mouseup', function() {
      dragging = false;
    });

    document.getElementById('play-btn').addEventListener('click', togglePlay);

    document.querySelectorAll('.pub-tab').forEach(function(tab) {
      tab.addEventListener('click', function() {
        selectPublisher(this.getAttribute('data-pub'));
      });
    });

    window.addEventListener('resize', function() {
      positionThumb(currentSliderPos);
    });

    movePubTabs(document.body.classList.contains('controls-open'));

    document.addEventListener('keydown', function(e) {
      var steps = pubSnapshots[currentPub];
      if (e.key === ' ') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (currentSliderPos < steps.length - 1) {
          goToSliderPos(currentSliderPos + 1, true);
          positionThumb(currentSliderPos);
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (currentSliderPos > 0) {
          goToSliderPos(currentSliderPos - 1, true);
          positionThumb(currentSliderPos);
        }
      } else if (e.key >= '1' && e.key <= '5') {
        selectPublisher(publisherOrder[parseInt(e.key) - 1]);
      } else if (e.key === 'Escape' && document.body.classList.contains('controls-open')) {
        setControlsOpen(false);
      }
    });
  }

  function updateSlider(pub) {
    var steps = pubSnapshots[pub];

    var best = steps.length - 1;
    if (currentSnapshotIndex >= 0) {
      var bestDist = Infinity;
      for (var i = 0; i < steps.length; i++) {
        var dist = Math.abs(steps[i] - currentSnapshotIndex);
        if (dist < bestDist) { bestDist = dist; best = i; }
      }
    }
    currentSliderPos = best;
    positionThumb(best);

    var n = steps.length;

    var firstYear = timelineData.snapshots[steps[0]].date.substring(0, 4);
    var lastYear = timelineData.snapshots[steps[steps.length - 1]].date.substring(0, 4);
    document.getElementById('year-range-start').textContent = firstYear;
    document.getElementById('year-range-end').textContent = lastYear;

    var barData = steps.map(function(snapIdx, i) {
      var snap = timelineData.snapshots[snapIdx];
      var pubChanges = (snap.changes || []).filter(function(c) {
        return c.publisher === pub;
      });
      var added = pubChanges.filter(function(c) { return c.type === 'added'; }).length;
      var removed = pubChanges.filter(function(c) { return c.type === 'removed'; }).length;
      if (i === 0 && added > 20 && removed === 0) added = 0;
      return { added: added, removed: removed, pos: i };
    });

    var maxCount = 1;
    barData.forEach(function(d) {
      if (d.added > maxCount) maxCount = d.added;
      if (d.removed > maxCount) maxCount = d.removed;
    });

    renderBars(barData, n, maxCount);
  }

  function renderBars(barData, numSteps, maxCount) {
    var container = document.getElementById('change-bars');
    container.innerHTML = '';

    if (maxCount === 0 || numSteps < 2) return;

    var halfH = 44;
    var scale = (halfH - 2) / maxCount;
    var barW = BAR_W;

    barData.forEach(function(d) {
      var left = (d.pos / (numSteps - 1) * 100) + '%';

      if (d.added > 0) {
        var h = d.added * scale;
        var bar = document.createElement('div');
        bar.className = 'cbar cbar-up';
        bar.style.left = left;
        bar.style.width = barW + 'px';
        bar.style.height = h + 'px';
        container.appendChild(bar);
      }

      if (d.removed > 0) {
        var h = d.removed * scale;
        var bar = document.createElement('div');
        bar.className = 'cbar cbar-down';
        bar.style.left = left;
        bar.style.width = barW + 'px';
        bar.style.height = h + 'px';
        container.appendChild(bar);
      }
    });
  }

  function selectPublisher(pub) {
    if (isPlaying) stopPlay();
    currentPub = pub;

    document.querySelectorAll('.pub-tab').forEach(function(tab) {
      tab.classList.toggle('active', tab.getAttribute('data-pub') === pub);
    });

    svg.attr('class', pub);

    nodesG.selectAll('*').remove();
    linksG.selectAll('*').remove();

    updateSlider(pub);

    var snapIdx = pubSnapshots[pub][currentSliderPos];
    currentSnapshotIndex = snapIdx;
    var snapshot = timelineData.snapshots[snapIdx];
    renderSnapshot(snapIdx, false);
    updateDateDisplay(snapshot);
    updateChanges(snapshot);
  }

  function goToSliderPos(pos, animate) {
    if (pos === currentSliderPos) return;
    currentSliderPos = pos;
    var snapIdx = pubSnapshots[currentPub][pos];
    currentSnapshotIndex = snapIdx;
    var snapshot = timelineData.snapshots[snapIdx];
    updateDateDisplay(snapshot);
    updateChanges(snapshot);
    renderSnapshot(snapIdx, animate);
  }

  function renderSnapshot(index, animate) {
    var computed = layouts[index][currentPub];
    if (!computed) return;

    var namedNodes = computed.nodes.filter(function(n) { return n._key; });
    var namedLinks = computed.links.filter(function(l) { return l._key; });

    var dur = animate ? ANIM_MS : 0;
    var pubColor = color[currentPub];

    var snapshot = timelineData.snapshots[index];
    var addedNames = {};
    var removedNames = {};
    var isInitial = (index === pubSnapshots[currentPub][0]);
    if (!isInitial) {
      (snapshot.changes || []).forEach(function(c) {
        if (c.publisher !== currentPub) return;
        if (c.type === 'added') addedNames[c.name] = true;
        if (c.type === 'removed') removedNames[c.name] = true;
      });
    }

    // ---- LINKS ----

    var linkSel = linksG.selectAll('.link')
      .data(namedLinks, function(d) { return d._key; });

    linkSel.exit()
      .style('pointer-events', 'none')
      .transition('anim').duration(dur)
      .style('stroke-opacity', 0)
      .remove();

    /** Green highlight only for flows leaving an added imprint, not flows into it from existing parents */
    function isAddedLink(d) {
      return !!addedNames[d.source.name];
    }

    function showAddedHighlight() {
      return controlsDrawerOpen();
    }

    var linkEnter = linkSel.enter()
      .append('path')
      .attr('class', 'link')
      .attr('d', sankeyLinkPath)
      .style('stroke-width', function(d) { return Math.max(1, d.dy); })
      .style('stroke', function(d) {
        return (showAddedHighlight() && isAddedLink(d)) ? '#00a832' : '#000';
      })
      .style('stroke-opacity', animate ? 0 : function(d) {
        if (!showAddedHighlight() && isAddedLink(d)) return 0.08;
        return isAddedLink(d) ? 0.5 : 0.08;
      });

    if (animate) {
      linkEnter
        .transition('anim').duration(dur)
        .style('stroke-opacity', function(d) {
          if (!showAddedHighlight() && isAddedLink(d)) return 0.08;
          return isAddedLink(d) ? 0.5 : 0.08;
        });
    }

    linkSel
      .transition('anim').duration(dur)
      .attr('d', sankeyLinkPath)
      .style('stroke-width', function(d) { return Math.max(1, d.dy); })
      .style('stroke', function(d) {
        return (showAddedHighlight() && isAddedLink(d)) ? '#00a832' : '#000';
      })
      .style('stroke-opacity', function(d) {
        if (!showAddedHighlight() && isAddedLink(d)) return 0.08;
        return isAddedLink(d) ? 0.5 : 0.08;
      });

    // ---- NODES ----

    var nodeSel = nodesG.selectAll('.node')
      .data(namedNodes, function(d) { return d._key; });

    var nodeExit = nodeSel.exit();
    nodeExit.style('pointer-events', 'none');
    nodeExit
      .transition('anim').duration(dur)
      .style('opacity', 0)
      .remove();

    var nodeEnter = nodeSel.enter()
      .append('g')
      .attr('class', 'node')
      .attr('transform', function(d) {
        return 'translate(' + d.x + ',' + d.y + ')';
      })
      .style('opacity', animate ? 0 : 1);

    nodeEnter.append('rect')
      .attr('height', function(d) { return d.dy; })
      .attr('width', NODE_WIDTH)
      .style('fill', pubColor)
      .style('stroke', 'none')
      .style('stroke-width', 0);

    nodeEnter.append('text')
      .attr('x', function(d) { return d.x < WIDTH / 2 ? 6 + NODE_WIDTH : -6; })
      .attr('y', function(d) { return d.dy / 2; })
      .attr('dy', '.35em')
      .attr('text-anchor', function(d) { return d.x < WIDTH / 2 ? 'start' : 'end'; })
      .attr('class', function(d) { return (d.org || '').replace(/ /g, ''); })
      .text(function(d) { return d.name; });

    if (animate) {
      nodeEnter
        .transition('anim').duration(dur)
        .style('opacity', 1);
    }

    nodeSel
      .transition('anim').duration(dur)
      .attr('transform', function(d) {
        return 'translate(' + d.x + ',' + d.y + ')';
      })
      .style('opacity', 1);

    nodeSel.select('rect')
      .transition('anim').duration(dur)
      .attr('height', function(d) { return d.dy; })
      .style('fill', function(d) {
        return (showAddedHighlight() && addedNames[d.name]) ? '#00a832' : pubColor;
      })
      .style('stroke', 'none')
      .style('stroke-width', 0);

    nodeSel.select('text')
      .transition('anim').duration(dur)
      .attr('x', function(d) { return d.x < WIDTH / 2 ? 6 + NODE_WIDTH : -6; })
      .attr('text-anchor', function(d) { return d.x < WIDTH / 2 ? 'start' : 'end'; })
      .attr('y', function(d) { return d.dy / 2; })
      .style('fill', function(d) {
        return (showAddedHighlight() && addedNames[d.name]) ? '#00a832' : null;
      })
      .text(function(d) { return d.name; });

    // Highlight added enter nodes too
    nodeEnter.select('rect')
      .style('fill', function(d) {
        return (showAddedHighlight() && addedNames[d.name]) ? '#00a832' : pubColor;
      });
    nodeEnter.select('text')
      .style('fill', function(d) {
        return (showAddedHighlight() && addedNames[d.name]) ? '#00a832' : null;
      });

    nodesG.selectAll('.node').each(function(d) {
      d3.select(this).classed('node-added', showAddedHighlight() && !!addedNames[d.name]);
    });

    linksG.selectAll('.link').each(function(d) {
      d3.select(this).classed('link-added', showAddedHighlight() && isAddedLink(d));
    });

    // Fit viewBox to actual node bounds (layout height can be less than maxHeights[pub])
    var minY = d3.min(namedNodes, function(n) { return n.y; });
    var maxY = d3.max(namedNodes, function(n) { return n.y + n.dy; });
    if (minY != null && maxY != null) {
      var vbY = minY - PAD;
      var vbH = (maxY - minY) + 2 * PAD;
      if (controlsDrawerOpen()) {
        vbH = Math.max(vbH - VIEWBOX_HEIGHT_TRIM_CONTROLS_OPEN, 1);
      }
      svg.attr('viewBox', (-PAD) + ' ' + vbY + ' ' + (WIDTH + 2 * PAD) + ' ' + vbH);
    }

    nodesG.selectAll('.node').select('rect')
      .on('mouseover', function(event, d) {
        if (!d.name) return;
        var thisName = d.name;
        var child = (d.sourceLinks.length === 0) ? d
          : d.sourceLinks[0].target;
        var grandchild = (child.sourceLinks.length === 0) ? child
          : child.sourceLinks[0].target;

        linksG.selectAll('.link')
          .filter(function(l) {
            return l.source.name === thisName
              || l.target.name === thisName
              || l.source.name === child.name
              || l.source.name === grandchild.name;
          })
          .style('stroke-opacity', 0.5)
          .style('stroke', pubColor);
      })
      .on('mouseleave', function() {
        linksG.selectAll('.link:not(.link-added)')
          .style('stroke-opacity', 0.08)
          .style('stroke', '#000');
        if (controlsDrawerOpen()) {
          linksG.selectAll('.link-added')
            .style('stroke-opacity', 0.5)
            .style('stroke', '#00a832');
        }
      });
  }

  function sankeyLinkPath(d) {
    var curvature = 0.5;
    var x0 = d.source.x + d.source.dx;
    var x1 = d.target.x;
    var xi = d3.interpolateNumber(x0, x1);
    var x2 = xi(curvature);
    var x3 = xi(1 - curvature);
    var y0 = d.source.y + d.sy + d.dy / 2;
    var y1 = d.target.y + d.ty + d.dy / 2;
    return 'M' + x0 + ',' + y0
      + 'C' + x2 + ',' + y0
      + ' ' + x3 + ',' + y1
      + ' ' + x1 + ',' + y1;
  }

  function updateDateDisplay(snapshot) {
    var parts = snapshot.date.split('-');
    var date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    document.getElementById('current-date').textContent =
      date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
  }

  function updateChanges(snapshot) {
    var el = document.getElementById('changes');

    var pubChanges = (snapshot.changes || []).filter(function(c) {
      return c.publisher === currentPub;
    });

    var isInitial = pubChanges.length > 0 &&
      pubChanges.filter(function(c) { return c.type === 'removed'; }).length === 0 &&
      pubChanges.filter(function(c) { return c.type === 'moved'; }).length === 0 &&
      pubChanges.filter(function(c) { return c.type === 'added'; }).length > 20;

    var addedList = isInitial ? [] : pubChanges.filter(function(c) { return c.type === 'added'; });
    var movedList = isInitial ? [] : pubChanges.filter(function(c) { return c.type === 'moved'; });
    var removedList = isInitial ? [] : pubChanges.filter(function(c) { return c.type === 'removed'; });

    var addedNames = addedList.map(function(c) { return escHtml(c.name); }).join(', ');
    var movedNames = movedList.map(function(c) { return escHtml(c.name); }).join(', ');
    var removedNames = removedList.map(function(c) { return escHtml(c.name); }).join(', ');

    el.innerHTML =
      '<div class="change-row"><span class="change-label change-added">' + addedList.length + ' new</span> <span class="change-names">' + addedNames + '</span></div>' +
      '<div class="change-row"><span class="change-label change-moved">' + movedList.length + ' moved</span> <span class="change-names">' + movedNames + '</span></div>' +
      '<div class="change-row"><span class="change-label change-removed">' + removedList.length + ' removed</span> <span class="change-names">' + removedNames + '</span></div>';
  }

  function escHtml(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function buildAllImprintEvents() {
    allImprintEvents = [];
    timelineData.snapshots.forEach(function(snap) {
      var d = snap.date;
      (snap.changes || []).forEach(function(c) {
        if (c.type === 'added' || c.type === 'removed' || c.type === 'moved') {
          allImprintEvents.push({
            date: d,
            type: c.type,
            publisher: c.publisher,
            name: c.name,
            from: c.from,
            to: c.to
          });
        }
      });
    });
  }

  function formatImprintEventDate(dateStr) {
    var parts = dateStr.split('-');
    var dt = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  function initImprintSearch() {
    var input = document.getElementById('imprint-search-input');
    var out = document.getElementById('imprint-search-results');
    if (!input || !out) return;

    function render() {
      var q = input.value.trim();
      if (!q) {
        out.innerHTML = '';
        return;
      }
      var ql = q.toLowerCase();
      var filtered = allImprintEvents.filter(function(ev) {
        return ev.name && ev.name.toLowerCase().indexOf(ql) !== -1;
      });
      if (filtered.length === 0) {
        out.innerHTML = '<p class="imprint-search-empty">No imprints match that search.</p>';
        return;
      }
      var groups = {};
      filtered.forEach(function(ev) {
        var key = ev.publisher + '\0' + ev.name;
        if (!groups[key]) {
          groups[key] = { publisher: ev.publisher, name: ev.name, events: [] };
        }
        groups[key].events.push(ev);
      });
      var keys = Object.keys(groups).sort(function(a, b) {
        var ga = groups[a];
        var gb = groups[b];
        var cmp = ga.name.localeCompare(gb.name);
        if (cmp !== 0) return cmp;
        return ga.publisher.localeCompare(gb.publisher);
      });
      var html = keys.map(function(key) {
        var g = groups[key];
        g.events.sort(function(a, b) {
          var c = a.date.localeCompare(b.date);
          if (c !== 0) return c;
          var order = { added: 0, moved: 1, removed: 2 };
          return (order[a.type] || 0) - (order[b.type] || 0);
        });
        var title = escHtml(g.name) + ' <span class="imprint-search-pub">(' + escHtml(publisherLabels[g.publisher] || g.publisher) + ')</span>';
        var rows = g.events.map(function(ev) {
          var kindClass = ev.type === 'added' ? 'is-added' : ev.type === 'removed' ? 'is-removed' : 'is-moved';
          var kindLabel = ev.type === 'added' ? 'Added' : ev.type === 'removed' ? 'Removed' : 'Moved';
          var detail = formatImprintEventDate(ev.date);
          if (ev.type === 'moved') {
            detail += ' — ' + escHtml(ev.from || '') + ' → ' + escHtml(ev.to || '');
          }
          return '<tr><td class="is-kind ' + kindClass + '">' + kindLabel + '</td><td class="is-detail">' + detail + '</td></tr>';
        }).join('');
        return '<div class="imprint-search-group"><div class="imprint-search-group-title">' + title + '</div><table class="imprint-search-detail">' + rows + '</table></div>';
      }).join('');
      out.innerHTML = html;
    }

    out.innerHTML = '';
    input.addEventListener('input', render);
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        input.value = '';
        render();
      }
    });
  }

  function togglePlay() {
    if (isPlaying) stopPlay();
    else startPlay();
  }

  function startPlay() {
    isPlaying = true;
    document.getElementById('play-btn').textContent = '\u23F8';
    var steps = pubSnapshots[currentPub];

    if (currentSliderPos >= steps.length - 1) {
      goToSliderPos(0, false);
      positionThumb(0);
    }

    playTimer = setInterval(function() {
      var steps = pubSnapshots[currentPub];
      if (currentSliderPos >= steps.length - 1) {
        stopPlay();
        return;
      }
      var next = currentSliderPos + 1;
      goToSliderPos(next, true);
      positionThumb(next);
    }, PLAY_MS);
  }

  function stopPlay() {
    isPlaying = false;
    document.getElementById('play-btn').textContent = '\u25B6';
    if (playTimer) {
      clearInterval(playTimer);
      playTimer = null;
    }
  }
})();
