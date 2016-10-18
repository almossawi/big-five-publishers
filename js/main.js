var global = {};
global.reservoir_min_opacity = 0.04;
global.reservoir_max_opacity = 0.15;

var formatNumber = d3.format(',.0f');
var format = function(d) {
  return formatNumber(d) + ' or more imprints';
};
var color = {
  PRH: '#ff8433',
  SS: '#cfab1c',
  Macmillan: '#c51039',
  HarperCollins: '#007cc4',
  Hachette: '#000'
};

// load data
d3.json('data/PRH.json', function(data) {
  doIt(data, 'PRH');
});

d3.json('data/Hachette.json', function(data) {
  doIt(data, 'Hachette');
});

d3.json('data/HarperCollins.json', function(data) {
  doIt(data, 'HarperCollins');
});

d3.json('data/Macmillan.json', function(data) {
  doIt(data, 'Macmillan');
});

d3.json('data/SS.json', function(data) {
  doIt(data, 'SS');
});

function doIt(data, publisher) {
  var svg = d3.select('svg.' + publisher)

  var margin = {
    top: 5,
    right: 1,
    bottom: 10,
    left: 1
  };
  var width = +svg.attr('width');
  var height = +svg.attr('height');

  var sankey = d3.sankey()
    .nodeWidth(16)
    .nodePadding(10)
    .size([width, height]);

  var path = sankey.link();

  svg = svg
    .attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom)
    .append('g')
    .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

  sankey
    .nodes(data.nodes)
    .links(data.links)
    .layout(32);

  var link = svg.append('g').selectAll('.link')
    .data(data.links)
    .enter().append('path')
    .attr('class', 'link')
    .attr('d', path)
    .style('stroke-width', function(d) {
      return Math.max(1, d.dy);
    })
    .sort(function(a, b) {
      return b.dy - a.dy;
    });

  link.append('title')
    .text(function(d) {
      return d.source.name + ' → ' + d.target.name +
        '\n' + format(d.value);
    });

  var node = svg.append('g').selectAll('.node')
    .data(data.nodes)
    .enter().append('g')
    .attr('class', 'node')
    .attr('transform', function(d) {
      return 'translate(' + d.x + ',' + d.y + ')';
    })
    .call(d3.behavior.drag()
      .origin(function(d) {
        return d;
      })
      .on('dragstart', function() {
        this.parentNode.appendChild(this);
      })
      .on('drag', dragmove));

  node.append('rect')
    .attr('height', function(d) {
      return d.dy;
    })
    .attr('width', sankey.nodeWidth())
    .attr('class', function(d) {
      return d.org;
    })
    .style('fill', function(d) {
      return d.color = color[d.org.replace(/ /g, '')];
    })
    .style('stroke', 'none')
    .on('mouseover', function(d) {
      var this_one = d.name;
      var this_ones_child = (d.target) ? d.target : d.sourceLinks[0].target;

      d3.selectAll('.' + publisher + ' .link')
        .filter(function(d2) {
          var source_imprint = d2.source.name;
          var target_imprint = d2.target.name;

          return source_imprint === this_one || target_imprint === this_one
            || d2.source.name == this_ones_child.name;
        })
        .style('stroke-opacity', 0.5)
        .style('stroke', function(d2) {
          return color[publisher];
        });
    })
    .on('mouseleave', function(d) {
      d3.selectAll('.' + publisher + ' .link')
        .style('stroke-opacity', 0.08)
        .style('stroke', '#000');
    })
    .append('title')
    .text(function(d) {
      return d.name +
        '\n' + format(d.value);
    });

  node.append('text')
    .attr('x', -6)
    .attr('y', function(d) {
      return d.dy / 2;
    })
    .attr('dy', '.35em')
    .attr('text-anchor', 'end')
    .attr('transform', null)
    .attr('class', function(d) {
      return d.org.replace(/ /g, '');
    })
    .text(function(d) {
      return d.name;
    })
    .filter(function(d) {
      return d.x < width / 2;
    })
    .attr('x', 6 + sankey.nodeWidth())
    .attr('text-anchor', 'start');

  function dragmove(d) {
    d3.select(this).attr('transform', 'translate(' + d.x + ',' + (d.y = Math.max(0, Math.min(height - d.dy, d3.event.y))) + ')');
    sankey.relayout();
    link.attr('d', path);
  }
}

window.onresize = function(event) {
  var width = Number(d3.select('.graphic').style('width').slice(0, -2));

  d3.selectAll('svg')
    .attr('width', width)
    .attr('height', null);
}