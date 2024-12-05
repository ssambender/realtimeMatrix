'use strict';

var WIDTH = 32;
var HEIGHT = 32;
var md = false;
var color = tinycolor('#FFD100');
var update;

$(document).ready(function() {
    const currentHost = window.location.host;
    $('.window h1').text(`Connected to ${currentHost}`);

    var picker = $('#custom');
    var palette = $('#palette');

    picker.val(color.toHexString());

    // Mouse and touch handling for the document
    $(document)
        .on('mousedown touchstart', function(e) {
            if ($(e.target).closest('tbody').length) {
                md = true;
            }
        })
        .on('mouseup touchend', function(e) {
            md = false;
        });

    $('table').on('dragstart', function(e) {
        e.preventDefault();
        return false;
    });

    // Create the grid
    for (var y = 0; y < HEIGHT; y++) {
        var row = $('<tr></tr>');
        for (var x = 0; x < WIDTH; x++) {
            row.append('<td></td>');
        }
        $('tbody').append(row);
    }

    // Tool selection
    $('.tools li').on('click touchstart', function(e) {
        e.preventDefault(); // Prevent default behavior
        md = false; // Reset dragging state

        switch ($(this).index()) {
            case 6: // Clear
                clear();
                break;
            case 7: // Save
                save();
                break;
            default: // Select tool
                $('.tools li').removeClass('selected');
                $(this).addClass('selected');
                break;
        }
    });

    // Color picker handling
    picker.on('change input', function(e) {
        e.preventDefault(); // Prevent default behavior
        md = false; // Reset dragging state

        color = tinycolor($(this).val());
        document.documentElement.style.setProperty('--selected-color', color);
    });

    // Palette selection
    palette.find('li').on('click touchstart', function(e) {
        e.preventDefault(); // Prevent default behavior
        md = false; // Reset dragging state

        pick(this);
    });

    // Handle tool actions
    function handle_tool(obj, is_click) {
        switch ($('.tools li.selected').index()) {
            case 0: // Paint
                paint(obj);
                break;
            case 1: // Fill
                if (is_click) fill(obj);
                break;
            case 2: // Erase
                update_pixel(obj, tinycolor('#000000'));
                break;
            case 3: // Pick
                pick(obj);
                break;
            case 4: // Lighten
                lighten(obj);
                break;
            case 5: // Darken
                darken(obj);
                break;
        }
    }

    var fill_target = null;
    var fill_stack = [];

    function fill(obj) {
        fill_target = tinycolor($(obj).css('background-color')).toRgbString();

        if (fill_target === color.toRgbString()) {  // == was ===
            return false;
        }

        var x = $(obj).index();
        var y = $(obj).parent().index();

        socket.send('fill');
        socket.send(new Uint8Array([x, y, color.toRgb().r, color.toRgb().g, color.toRgb().b]));
        socket.send('show');

        do_fill(obj);

        while (fill_stack.length > 0) {
            var pixel = fill_stack.pop();
            do_fill(pixel);
        }
    }

    function is_target_color(obj) {
        return tinycolor($(obj).css('background-color')).toRgbString() === fill_target; // === was ==
    }

    function do_fill(obj) {
        var obj = $(obj);

        if (is_target_color(obj)) {
            $(obj).css('background-color', color.toRgbString());

            var r = obj.next('td'); // Right
            var l = obj.prev('td'); // Left
            var u = obj.parent().prev('tr').find('td:eq(' + obj.index() + ')'); // Above
            var d = obj.parent().next('tr').find('td:eq(' + obj.index() + ')'); // Below

            if (r.length && is_target_color(r[0])) fill_stack.push(r[0]);
            if (l.length && is_target_color(l[0])) fill_stack.push(l[0]);
            if (u.length && is_target_color(u[0])) fill_stack.push(u[0]);
            if (d.length && is_target_color(d[0])) fill_stack.push(d[0]);
        }
    }

    function save() {
        var filename = prompt('Please enter a filename', 'mypaint');
        filename = filename.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        socket.send('save');
        socket.send(filename);
    }

    function clear() {
        $('td').css('background-color', 'rgb(0,0,0)').data('changed', false);
        socket.send('clear');
        socket.send('show');
    }

    function lighten(obj) {
        var c = tinycolor($(obj).css('background-color'));
        c.lighten(.5);
        update_pixel(obj, c);
    }

    function darken(obj) {
        var c = tinycolor($(obj).css('background-color'));
        c.darken(.5);
        update_pixel(obj, c);
    }

    function pick(obj) {
        color = tinycolor($(obj).css('background-color'));
        document.documentElement.style.setProperty('--selected-color', color);
        picker.val(color.toHexString());
    }

    function update_pixel(obj, col) {
        var bgcol = tinycolor($(obj).css('background-color'));

        if (col !== bgcol) {  // !== was !=
            $(obj)
                .data('changed', true)
                .css('background-color', col.toRgbString());
        }
    }

    function update_pixels() {
        var changed = false;

        $('td').each(function(index, obj) {
            if ($(obj).data('changed')) {
                $(obj).data('changed', false);
                changed = true;

                var x = $(this).index();
                var y = $(this).parent().index();
                var col = tinycolor($(obj).css('background-color')).toRgb();

                if (socket) {
                    socket.send(new Uint8Array([x, y, col.r, col.g, col.b]));
                }
            }
        });

        if (changed) {
            socket.send('show');
        }
    }

    function paint(obj) {
        update_pixel(obj, color);
    }

    $('table td').on('click touchstart', function(e) {
        handle_tool(this, true);
        e.preventDefault();
    });

    $('table td').on('mousemove touchmove', function(e) {
        if (!md) return false;

        e.preventDefault();

        var targetCell = $(this);

        if (e.type === 'touchmove') {
            var touch = e.originalEvent.touches[0];
            targetCell = document.elementFromPoint(touch.clientX, touch.clientY);
            targetCell = $(targetCell).closest('td');
        }

        handle_tool(targetCell[0], false);
    });

    const socket = new WebSocket('ws://' + window.location.host + '/paint');

    socket.addEventListener('message', ev => {
        console.log('<<< ' + ev.data);

        if (ev.data.substring(0, 6) === 'alert:') {  // === was ==
            alert(ev.data.substring(6));
        }
    });

    socket.addEventListener('close', ev => {
        console.log('<<< closed');
    });

    socket.addEventListener('open', ev => {
        clear();
        update = setInterval(update_pixels, 50);
    });
});