var sudoku = sudoku || {};
sudoku.implementation = sudoku.implementation || {};
sudoku.implementation.solver = sudoku.implementation.solver || {};
sudoku.implementation.solver.algorithm = function () {
    function create(inputMatrix, excludeNumberCallback, solveNumberCallback) {
        var solver = {};

        /*
         * Private Attributes
         */

        // CHANGE BIT
        // ------------------------
        // As the big 'next()' function operates, we want to keep track of any
        // new discoveries (exclusions or solutions) we make during that cycle.
        //
        // The last step in 'next()' is an operation which must only be called
        // when we know that there was absolutely nothing else to do.
        //
        // The change bit detects if we've discovered anything new since the
        // start of the iteration. This bit is set anytime a new number is
        // solved or excluded, and the function should consistently check the
        // state of the change bit and exit if it gets set.
        //
        var _changeBit = 0;

        // SOLUTION MATRIX
        // -----------------------
        // The solution matrix is a 9x9 grid that contains either null values or
        // the numbers that are known to be part of the solution. During
        // construction, it gets initialized with the inputMatrix, and as numbers
        // are solved, it gets filled in.
        //
        var _solutionMatrix = inputMatrix.clone();

        // EXCLUSION MATRIX
        // -----------------------
        // The exclusion matrix also has a zeroth dimension NUMBER, which ranges
        // from 0 to 8 to contain exclusion matrices for 1 - 9. For example, to find
        // whether number 4 is excluded from the top-center row and column, you
        // would search
        //
        // _exclusionMatrix[3][0][4].
        //
        // Exclusion matrix is [number][row][col], and each value is 0 if not
        // excluded and 1 if excluded.
        //
        var _exclusionMatrix = _createEmptyExclusionMatrix();
        var _excludeNumberCallback = excludeNumberCallback || _defaultExcludeNumberCallback;
        var _solveNumberCallback = solveNumberCallback || _defaultSolveNumberCallback;
        var _solutionInProgress = 0;

        // **********************************
        // PUBLIC METHODS
        // **********************************

        /**
         * Returns a clone of the current matrix of solved values.
         */
        solver.getSolutionMatrix = function () {
            return _solutionMatrix.clone();
        }

        /**
         * Advances to the next stage of solution.
         */
        solver.next = function () {
            // Make sure we didn't make a mistake
            _validate();

            // Clear the change bit.
            _changeBit = 0;

            // STARTUP -----------------------------------
            // Exclude all initial numbers in the solution matrix if we're next'ing
            // for the first time.
            if (!_solutionInProgress) {
                _solutionMatrix.iterateOverRowAndColumn(function (row, col, sq, value) {
                    // watch out for null values.
                    if (value) {
                        _excludeNewNumber(value, row, col);
                    }
                });

                _solutionInProgress = 1;
                return _changeBit;
            }

            // For each number, look for solutions.
            for (numberToSolve = 1; numberToSolve <= 9; numberToSolve++) {
                // Get the possibilities (the compliments of the exclusion matrix at the
                // present number). Sort them into array of hashes for easy processing.
                var possibilityMatrix = _exclusionMatrix[numberToSolve - 1].booleanCompliment();
                var possibilities = possibilityMatrix.getOccurrancesOfValue(1);

                /*
                 * Go through each possibility and look for reasons to accept it or
                 * exclude others.
                 */
                for (var iPos = 0; iPos < possibilities.length; iPos++) {
                    var possibility = possibilities[iPos];
                    var row = possibility.row;
                    var col = possibility.col;
                    var square = possibility.square;

                    // Get filtered possibilities.
                    var possibilitiesInRow = possibilities.filter(function (p) {
                        return p.row == row;
                    });
                    var possibilitiesInCol = possibilities.filter(function (p) {
                        return p.col == col;
                    });

                    var possibilitiesInSquare = possibilities.filter(function (p) {
                        return p.square == square;
                    });

                    // Check 1
                    // ------------------------
                    // If any of these are length 1, then the possibility is unique in the
                    // row or column, and we identify it as a solution.
                    var isUniqueInRow = possibilitiesInRow.length === 1;
                    var isUniqueInCol = possibilitiesInCol.length === 1;
                    var isUniqueInSquare = possibilitiesInSquare.length === 1;

                    var isSolution = isUniqueInRow || isUniqueInCol || isUniqueInSquare;
                    if (isSolution) {
                        _solveNumber(numberToSolve, row, col);
                    }

                    if (_changeBit) {
                        return true;
                    }

                    // Check 2
                    // ------------------------
                    // For a single number,
                    // If 2 or more possiblities share a row and a square:
                    // ...and they happen to be the only options in the square
                    // ......(unique on square), then exclude the rest of the row.
                    // ...and they are the only options on the row (unique on row),
                    // ......exclude the rest of the square.
                    // Note: Check 3 does the same thing for column & square.
                    var possibilitiesInRowAndSquare = possibilitiesInRow.filter(function (p) {
                        return p.square == square;
                    });

                    // Unique in square if number of (Row U Square) == (Square).
                    isUniqueInSquare = (possibilitiesInRowAndSquare.length == possibilitiesInSquare.length);

                    // If they are unique in square, exclude the rest of the row.
                    // "We need a 7 _somewhere_ in this square, and the only options are
                    // on this row, so we'll
                    // exclude all the other spots on the row cause the 7 can't be there."
                    if (isUniqueInSquare) {
                        // Exclude the rest of the row.
                        _excludeRowOrColumn(1, numberToSolve, row, possibilitiesInRowAndSquare);
                    }

                    // Unique in row if Number of (Row U Square) == (Row).
                    isUniqueInRow = (possibilitiesInRowAndSquare.length == possibilitiesInRow.length);
                    // Exclude the rest of the square.
                    if (isUniqueInRow) {
                        _excludeSquare(numberToSolve, row, col, possibilitiesInRowAndSquare);
                    }

                    if (_changeBit) {
                        return true;
                    }

                    // Check 3
                    // ------------------------
                    // Identical to Check 2 but checks column instead of row.
                    var possibilitiesInColAndSquare = possibilitiesInCol.filter(function (p) {
                        return p.square == square;
                    });

                    // Unique in square if N(Col U Square) == N(Square).
                    isUniqueInSquare = (possibilitiesInColAndSquare.length == possibilitiesInSquare.length);
                    if (isUniqueInSquare) {
                        _excludeRowOrColumn(0, numberToSolve, col, possibilitiesInColAndSquare);
                    }

                    // Unique in column if N(Col U Square) == N(Col).
                    isUniqueInCol = (possibilitiesInColAndSquare.length == possibilitiesInCol.length);

                    // Exclude the rest of the square.
                    if (isUniqueInCol) {
                        _excludeSquare(numberToSolve, row, col, possibilitiesInColAndSquare);
                    }

                    if (_changeBit) {
                        return true;
                    }
                }// End Iterating through possibilities for a single number.

                // Check 4
                // ------------------------
                // For this number, if we can identify any spot where
                // all the other numbers _aren't_, then we know the
                // number has to be in that spot.
                //
                // This is called the inverse elimination principle.
                var inverseEliminationResult = _inverseEliminate(numberToSolve);

                // If there are numbers found, then we assign them to the spot!
                var eliminationSurvivors = inverseEliminationResult.getOccurrancesOfValue(1);
                if (eliminationSurvivors.length) {
                    var row = eliminationSurvivors[0].row;
                    var col = eliminationSurvivors[0].col;
                    _solveNumber(numberToSolve, row, col);
                }

                if (_changeBit) {
                    return true;
                }
            }// End iterating through numbers.

            // Check 5
            // ------------------------
            // If we get down here and still haven't found anything, it's time to
            // break out the set theory to expose a few more exclusions. This is
            // computationally expensive but only necessary once or twice on hard
            // puzzles.
            //
            // This technique (cross-number exclusion) is very powerful but can ruin
            // the puzzle if you use it when it's not strictly necessary. That's why
            // we keep checking the change bit!

            // ExclusionResults is an array of objects where each object has 'number',
            // 'row' and 'col'.
            var exclusionResults = sudoku.implementation.solver.crossNumberExclusion
                .combineExclusionMatrices(_exclusionMatrix);

            if (exclusionResults.length) {
                exclusionResults.forEach(function (e) {
                    _excludeCell(e.number, e.row, e.col);
                });
            }

            if (_changeBit) {
                return true;
            } else {
                return false;
            }
        }

        // **********************************
        // PRIVATE METHODS
        // **********************************

        /**
         * Default method when excluding a number.
         */
        function _defaultExcludeNumberCallback(number, row, column) {
            console.log('Excluding number "' + number + '" from row "' + row + '" and column "' + column
                + '".');
        }

        /**
         * Default method when solving a number.
         */
        function _defaultSolveNumberCallback(number, row, column) {
            console.log('Resolved Number "' + number + '" at row "' + row + '" and column "' + column
                + '".');
        }

        /**
         * Excludes a single cell at a specific number by: (a) updating the
         * exclusion matrix for that number, and (b) calling the callback for that
         * number and cell.
         */
        function _excludeCell(number, row, col) {
            // Check to see if the cell was already excluded.
            var isAlreadyExcluded = _exclusionMatrix[number - 1].get(row, col);
            if (isAlreadyExcluded) {
                return;
            }

            _changeBit = 1;
            _exclusionMatrix[number - 1].set(row, col, 1);
            _excludeNumberCallback(number, row, col);
        }

        /**
         * Given a number known to be in a certain spot, update all the exclusion
         * matrices to exclude the location, and update the number's exclusion
         * matrix to eliminate other spots in the same row and column.
         */
        function _excludeNewNumber(number, row, col) {
            // Eliminate the location.
            for (var iNumber = 1; iNumber <= 9; iNumber++) {
                _excludeCell(iNumber, row, col);
            }

            // Exclude the row, column and square from that numbers' matrix.
            _excludeRowOrColumn(1, number, row, []);
            _excludeRowOrColumn(0, number, col, []);
            _excludeSquare(number, row, col, []);
        }

        /**
         * Excludes the whole row or column (rowOrCol), skipping any exceptions,
         * from the given number's matrix. To exclude the row, 'selectRow' must be
         * true. Otherwise, the column is excluded. Exceptions should be an array of
         * occurrances where the keys are 'row', 'col' and 'square'. If you're
         * excluding a whole row, any cells where the column matches the column in
         * an exception, it will be skipped.
         */
        function _excludeRowOrColumn(selectRow, number, rowOrCol, exceptions) {
            var hasExceptions = (exceptions && exceptions.length);
            var exceptionHash = {};
            if (hasExceptions) {
                exceptions.forEach(function (e) {
                    // If excluding row, exceptions must live on the same row for us to
                    // ignore their columns.
                    if (selectRow) {
                        if (e.row !== rowOrCol)
                            return;
                    } else {
                        if (e.col !== rowOrCol)
                            return;
                    }

                    var key = selectRow ? e.col : e.row;
                    exceptionHash[key] = 1;
                });
            }

            for (var i = 0; i < 9; i++) {
                // Skip if this iteration is excepted.
                if (exceptionHash[i]) {
                    continue;
                }

                // Eliminate the number at that row and column.
                var row;
                var col;
                if (selectRow) {
                    row = rowOrCol;
                    col = i;
                } else {
                    row = i;
                    col = rowOrCol;
                }
                _excludeCell(number, row, col);
            }
        }

        /**
         * Excludes the square where the given row and column points. Exceptions are
         * an arry of objects that have keys 'row', 'col' and 'square'.
         */
        function _excludeSquare(number, row, col, exceptions) {
            // Filter the exceptions for the presence in the same square.
            var hasExceptions = (exceptions && exceptions.length);
            var squareBounds = _getSquareBounds(row, col);

            var minRow = squareBounds[0];
            var maxRow = squareBounds[1];
            var minCol = squareBounds[2];
            var maxCol = squareBounds[3];

            for (var iRow = minRow; iRow <= maxRow; iRow++) {
                for (var iCol = minCol; iCol <= maxCol; iCol++) {
                    var skipExcludedCell = 0;
                    exceptions.forEach(function (e) {
                        if (e.row === iRow && e.col === iCol) {
                            skipExcludedCell = 1;
                        }
                    });

                    if (skipExcludedCell)
                        continue;

                    _excludeCell(number, iRow, iCol);
                }
            }
        }

        /**
         * Generates an empty exclusion matrix. Dimensions are [D x M x N] where D
         * is the digit, M is the row and N is the column.
         */
        function _createEmptyExclusionMatrix() {
            var result = [];
            for (var i = 0; i < 9; i++) {
                result.push(new sudoku.math.Matrix(0));
            }
            return result;
        }

        /*
         * Gets the bounds for a square. Returns bounds like this: [minRow, maxRow,
         * minCol, maxCol]
         */
        function _getSquareBounds(row, col) {
            var minRow;
            var maxRow;
            var minCol;
            var maxCol;

            // Find Row bounds.
            if (row < 3) {
                minRow = 0;
                maxRow = 2;
            } else if (row < 6) {
                minRow = 3;
                maxRow = 5;
            } else {
                minRow = 6;
                maxRow = 8;
            }

            // Find Column bounds.
            if (col < 3) {
                minCol = 0;
                maxCol = 2;
            } else if (col < 6) {
                minCol = 3;
                maxCol = 5;
            } else {
                minCol = 6;
                maxCol = 8;
            }

            return [minRow, maxRow, minCol, maxCol];
        }

        /**
         * Uses inverse elimination principle to find spots where the number has to
         * be because all the other numbers can't be there.
         *
         * Returns an MxM matrix of 1's and zeros where 1's indicate all others have
         * excluded The present number.
         */
        function _inverseEliminate(numberToSolve) {
            var result = new sudoku.math.Matrix(0);
            result.iterateOverRowAndColumn(function (row, col, square, value) {
                // For the given spot, assume it's excluded by all other numbers until
                // we see that its explicitely NOT excluded by one of them.
                var excludedByAll = 1;
                for (var number = 1; number <= 9; number++) {
                    // Whether or not this row/col is excluded by this number.
                    var excludedByNumber = _exclusionMatrix[number - 1].get(row, col);

                    if (number === numberToSolve) {
                        // If current number is the number to solve, this cell can only
                        // continue to be excluded by all others if the current number is
                        // NOT excluding it.
                        excludedByAll = excludedByAll && !excludedByNumber;
                    } else {
                        // In general, the cell continues to be excluded by all others if
                        // the current number also excludes it.
                        excludedByAll = excludedByAll && excludedByNumber;
                    }

                    if (!excludedByAll) {
                        break;
                    }
                }// end iterating through numbers.

                result.set(row, col, excludedByAll);
            });

            return result;
        }

        /**
         * When a number has been determined to be in a certain spot, we solve it!
         */
        function _solveNumber(number, row, col) {
            // Update the solution matrix.
            _solutionMatrix.set(row, col, number);

            // Update the exclusion matrix.
            _excludeNewNumber(number, row, col);

            // Call the solve callback.
            _solveNumberCallback(number, row, col);
        }
        /*
         * Makes sure the input data is valid. If it's not, abort construction.
         */
        function _validate() {
            /*
             *
             * for each filled in spot on the matrix, the value must be unique on row
             * and column.
             */
            _solutionMatrix.iterateOverRowAndColumn(function (row, col, sq, val) {
                if (val !== null) {
                    var isValid = _solutionMatrix.isStrictlyUnique(row, col);
                    if (!isValid) {
                        throw "Invalid solution found in Matrix, near number '" + number + "' in row '"
                        + (row + 1) + "' and column '" + (col + 1) + "'.";
                    }
                }
            });
        }

        _validate();

        return solver;
    }

    return {
        create: create,
    };
}();