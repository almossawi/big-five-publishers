var global = {};
global.reservoir_min_opacity = 0.04;
global.reservoir_max_opacity = 0.15;

var formatNumber = d3.format(",.0f");
var format = function(d) {
  return formatNumber(d) + " or more imprints";
};
var color = {
  PRH: "#ff8433",
  SS: "#cfab1c",
  Macmillan: "#c51039",
  HarperCollins: "#007cc4",
  Hachette: "#000"
};

// load data
d3.json("data/PRH.json", function(data) {
  doIt(data, 'PRH');
});

d3.json("data/Hachette.json", function(data) {
  doIt(data, 'Hachette');
});

d3.json("data/HarperCollins.json", function(data) {
  doIt(data, 'HarperCollins');
});

d3.json("data/Macmillan.json", function(data) {
  doIt(data, 'Macmillan');
});

d3.json("data/SS.json", function(data) {
  doIt(data, 'SS');
});

function doIt(data, publisher) {
  var svg = d3.select("svg." + publisher)

  var margin = {
    top: 5,
    right: 1,
    bottom: 5,
    left: 1
  };
  var width = +svg.attr('width');
  var height = +svg.attr('height');

  var sankey = d3.sankey()
    .nodeWidth(16)
    .nodePadding(11)
    .size([width, height]);

  var path = sankey.link();

  svg = svg
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

  sankey
    .nodes(data.nodes)
    .links(data.links)
    .layout(32);

  var link = svg.append("g").selectAll(".link")
    .data(data.links)
    .enter().append("path")
    .attr("class", 'link')
    .attr("d", path)
    .style("stroke-width", function(d) {
      return Math.max(1, d.dy);
    })
    .sort(function(a, b) {
      return b.dy - a.dy;
    });

  link.append("title")
    .text(function(d) {
      return d.source.name + " → " + d.target.name +
        "\n" + format(d.value);
    });

  var node = svg.append("g").selectAll(".node")
    .data(data.nodes)
    .enter().append("g")
    .attr("class", "node")
    .attr("transform", function(d) {
      return "translate(" + d.x + "," + d.y + ")";
    })
    .call(d3.behavior.drag()
      .origin(function(d) {
        return d;
      })
      .on("dragstart", function() {
        this.parentNode.appendChild(this);
      })
      .on("drag", dragmove));

  node.append("rect")
    .attr("height", function(d) {
      return d.dy;
    })
    .attr("width", sankey.nodeWidth())
    .attr('class', function(d) {
      return d.org;
    })
    .style("fill", function(d) {
      return d.color = color[d.org.replace(/ /g, '')];
    })
    .style("stroke", "none")
    .on('mouseover', function(d) {
      d3.selectAll('.' + publisher + ' .link')
        .filter(function(d2) {
          var source_imprint = d2.source.imprint;
          var target_imprint = d2.target.imprint;
          var this_one = d.imprint;

          return source_imprint === this_one || target_imprint === this_one;
        })
        .style('stroke-opacity', 0.3)
        .style('stroke', function(d2) {
          return color[publisher];
        });
        
        /*d3.selectAll('.' + publisher + ' .node text')
          .filter(function(d2) {
            return d2.imprint !== d.imprint && d2.root !== '1';
          })
          .style('opacity', 0);*/
    })
    .on('mouseleave', function(d) {
      d3.selectAll('.' + publisher + ' .link')
        .style('stroke-opacity', 0.08)
        .style('stroke', '#000');
        
      /*d3.selectAll('.' + publisher + ' .node text')
        .style('opacity', 1);*/
    })
    .append("title")
    .text(function(d) {
      return d.name +
        "\n" + format(d.value);
    });

  node.append("text")
    .attr("x", -6)
    .attr("y", function(d) {
      return d.dy / 2;
    })
    .attr("dy", ".35em")
    .attr("text-anchor", "end")
    .attr("transform", null)
    .attr('class', function(d) {
      return d.org.replace(/ /g, '');
    })
    .text(function(d) {
      return d.name;
    })
    .filter(function(d) {
      return d.x < width / 2;
    })
    .attr("x", 6 + sankey.nodeWidth())
    .attr("text-anchor", "start");

  function dragmove(d) {
    d3.select(this).attr("transform", "translate(" + d.x + "," + (d.y = Math.max(0, Math.min(height - d.dy, d3.event.y))) + ")");
    sankey.relayout();
    link.attr("d", path);
  }

  var linkExtent = d3.extent(data.links, function(d) {
    return d.value
  });
  var frequencyScale = d3.scale.linear().domain(linkExtent).range([0.05, 0.5]);

  data.links.forEach(function(link) {
    link.freq = frequencyScale(link.value);
    link.particleSize = 1;
    link.particleColor = d3.scale.linear().domain([0, 1])
      .range([link.source.color, link.target.color]);
  })

  var t = d3.timer(tick, 1000);
  var particles = [];

  function tick(elapsed) {
    particles = particles.filter(function(d) {
      return d.current < d.path.getTotalLength()
    });

    d3.selectAll("path.link")
      .each(
        function(d) {
          for (var x = 0; x < 2; x++) {
            var offset = (Math.random() - .5) * (d.dy - 4);
            if (Math.random() < d.freq) {
              var length = this.getTotalLength();
              particles.push({
                link: d,
                time: elapsed,
                offset: offset,
                path: this,
                length: length,
                animateTime: length,
                speed: (Math.random())
              })
            }
          }
        });
  }
}

window.onresize = function(event) {
  var width = Number(d3.select('.graphic').style('width').slice(0, -2));

  d3.selectAll('svg')
    .attr('width', width)
    .attr('height', null);
}