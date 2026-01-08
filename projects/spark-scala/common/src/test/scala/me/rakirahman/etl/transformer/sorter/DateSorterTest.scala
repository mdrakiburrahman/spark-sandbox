package me.rakirahman.etl.transformer.sorter

import java.sql.Timestamp

import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers
import org.scalatest.prop.TableDrivenPropertyChecks

/** Date Sorter tests.
  */
// @formatter:off
class DateSorterTest extends AnyFunSpec with Matchers with TableDrivenPropertyChecks {

    describe("YearMonthDate") {
        it("can sort dates in the format 'yyyyMMdd'") {
            assert(
                Seq(
                    "20230101", // January 1, 2023
                    "20221231", // December 31, 2022
                    "20230102", // January 2, 2023
                    "20230201", // February 1, 2023
                    "20220101", // January 1, 2022
                    "20231231", // December 31, 2023
                    "20231130", // November 30, 2023
                    "20230228", // February 28, 2023
                    "20230227", // February 27, 2023
                    "20230301"  // March 1, 2023
                ).sorted(DateSorter.get(DateTypes.YearMonthDate)) ==
                Seq(
                    "20220101", // January 1, 2022
                    "20221231", // December 31, 2022
                    "20230101", // January 1, 2023
                    "20230102", // January 2, 2023
                    "20230201", // February 1, 2023
                    "20230227", // February 27, 2023
                    "20230228", // February 28, 2023
                    "20230301", // March 1, 2023
                    "20231130", // November 30, 2023
                    "20231231"  // December 31, 2023
                )
            )
        }
    }

    describe("YearMonth") {
        it("can sort dates in the format 'yyyyMM'") {
            assert(
                Seq(
                    "202301", // January 2023
                    "202212", // December 2022
                    "202302", // February 2023
                    "202201", // January 2022
                    "202312", // December 2023
                    "202311", // November 2023
                    "202303"  // March 2023
                ).sorted(DateSorter.get(DateTypes.YearMonth)) ==
                Seq(
                    "202201", // January 2022
                    "202212", // December 2022
                    "202301", // January 2023
                    "202302", // February 2023
                    "202303", // March 2023
                    "202311", // November 2023
                    "202312"  // December 2023
                )
            )
        }
    }

    describe("Year") {
        it("can sort dates in the format 'yyyy'") {
            assert(
                Seq(
                    "2024",
                    "2021",
                    "1990",
                    "9921"
                ).sorted(DateSorter.get(DateTypes.Year)) ==
                Seq(
                    "1990",
                    "2021",
                    "2024",
                    "9921"
                )
            )
        }
    }

    describe("YearMonthDateHour") {
        it("can sort dates in the format 'yyyyMMddHH'") {
            assert(
                Seq(
                    "2023010112", // Jan 1, 2023, 12:00
                    "2023010101", // Jan 1, 2023, 01:00
                    "2022123123", // Dec 31, 2022, 23:00
                    "2023010200", // Jan 2, 2023, 00:00
                    "2022010115", // Jan 1, 2022, 15:00
                    "2023123105", // Dec 31, 2023, 05:00
                    "2023113022", // Nov 30, 2023, 22:00
                    "2023022821", // Feb 28, 2023, 21:00
                    "2023022720", // Feb 27, 2023, 20:00
                    "2023030103"  // Mar 1, 2023, 03:00
                ).sorted(DateSorter.get(DateTypes.YearMonthDateHour)) ==
                Seq(
                    "2022010115", // Jan 1, 2022, 15:00
                    "2022123123", // Dec 31, 2022, 23:00
                    "2023010101", // Jan 1, 2023, 01:00
                    "2023010112", // Jan 1, 2023, 12:00
                    "2023010200", // Jan 2, 2023, 00:00
                    "2023022720", // Feb 27, 2023, 20:00
                    "2023022821", // Feb 28, 2023, 21:00
                    "2023030103", // Mar 1, 2023, 03:00
                    "2023113022", // Nov 30, 2023, 22:00
                    "2023123105"  // Dec 31, 2023, 05:00
                )
            )
        }
    }

    describe("convert") {
        it("must be able to convert java.sql.Timestamp") {
            val timestamp = Timestamp.valueOf("2023-01-01 12:00:00")

            assert(DateSorter.convert(timestamp, DateTypes.Year) == "2023")
            assert(DateSorter.convert(timestamp, DateTypes.YearMonth) == "202301")
            assert(DateSorter.convert(timestamp, DateTypes.YearMonthDate) == "20230101")
            assert(DateSorter.convert(timestamp, DateTypes.YearMonthDateHour) == "2023010112")
        }

        it("must correctly convert date strings to java.sql.Timestamp") {

            forAll(
                Table
                    (
                        ("dateStr",    "columnName",                                 "expectedTimestamp"),
                        ("2023",       SortableColumnNames.YEAR_LIT,                 Timestamp.valueOf("2023-01-01 00:00:00")),
                        ("202301",     SortableColumnNames.YEAR_MONTH_LIT,           Timestamp.valueOf("2023-01-01 00:00:00")),
                        ("20230101",   SortableColumnNames.YEAR_MONTH_DATE_LIT,      Timestamp.valueOf("2023-01-01 00:00:00")),
                        ("19991231",   SortableColumnNames.YEAR_MONTH_DATE_LIT,      Timestamp.valueOf("1999-12-31 00:00:00")),
                        ("202212",     SortableColumnNames.YEAR_MONTH_LIT,           Timestamp.valueOf("2022-12-01 00:00:00")),
                        ("20221231",   SortableColumnNames.YEAR_MONTH_DATE_LIT,      Timestamp.valueOf("2022-12-31 00:00:00")),
                        ("2023010112", SortableColumnNames.YEAR_MONTH_DATE_HOUR_LIT, Timestamp.valueOf("2023-01-01 12:00:00")),
                        ("2022123123", SortableColumnNames.YEAR_MONTH_DATE_HOUR_LIT, Timestamp.valueOf("2022-12-31 23:00:00"))
                    )
              )
              { (dateStr, columnName, expectedTimestamp) =>
                DateSorter.convert(dateStr, columnName) shouldEqual expectedTimestamp
              }
        }
    }
}
