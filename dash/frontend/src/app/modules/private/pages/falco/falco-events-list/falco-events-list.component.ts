import {Component, OnInit} from '@angular/core';
import {FalcoService} from '../../../../../core/services/falco.service';
import {MatTableDataSource} from '@angular/material/table';
import {take} from 'rxjs/operators';
import {IFalcoLog} from '../../../../../core/entities/IFalcoLog';
import {ActivatedRoute} from '@angular/router';
import {ShowJsonDataComponent} from '../../../../../core/dialogues/show-json-data/show-json-data.component';
import {MatDialog, MatDialogRef} from '@angular/material/dialog';

import {FormBuilder, FormGroup, Validators} from '@angular/forms';

import {EnumService} from '../../../../../core/services/enum.service';
import {format, startOfToday, sub} from 'date-fns';
import {CustomValidatorService} from '../../../../../core/services/custom-validator.service';
import {NgxUiLoaderService} from 'ngx-ui-loader';

import {CsvService} from '../../../../../core/services/csv.service';

import {FalcoDialogComponent} from '../falco-dialog/falco-dialog.component';



@Component({
  selector: 'app-falco-events-list',
  templateUrl: './falco-events-list.component.html',
  styleUrls: ['./falco-events-list.component.scss']
})
export class FalcoEventsListComponent implements OnInit {

  dataSource: MatTableDataSource<IFalcoLog>;
  displayedColumns = ['calendarDate', 'namespace', 'pod', 'image', 'priority', 'message'];
  clusterId: number;
  dialogRef: MatDialogRef<ShowJsonDataComponent>;

  filterForm: FormGroup;
  priorityLevels: string [] = ['Emergency', 'Alert', 'Critical', 'Error', 'Warning', 'Notice', 'Informational', 'Debug'];
  orderByOptions: string [] = ['Priority Desc', 'Priority Asc', 'Date Desc', 'Date Asc'];

  logCount: number;
  limit = this.getLimitFromLocalStorage() ? Number(this.getLimitFromLocalStorage()) : 20;
  page: number;

  constructor(
    private falcoService: FalcoService,
    private route: ActivatedRoute,
    private dialog: MatDialog,
    private enumService: EnumService,
    private formBuilder: FormBuilder,
    private customValidatorService: CustomValidatorService,
    private loaderService: NgxUiLoaderService,
    private csvService: CsvService,
  ) {}

  ngOnInit() {
    this.route.parent.parent.params
      .pipe(take(1))
      .subscribe(param => {
        this.clusterId = param.id;
        this.getEvents();
      });

    this.filterForm = this.formBuilder.group({
      selectedPriorityLevels: [[]],
      selectedOrderBy: [],
      startDate: [],
      endDate: []
    });

  }

  pageEvent(pageEvent: any) {
    this.limit = pageEvent.pageSize;
    this.page = pageEvent.pageIndex;
    this.setLimitToLocalStorage(this.limit);
    this.getEvents();
  }

  getEvents() {
    this.falcoService.getFalcoLogs(this.clusterId, this.limit, this.page)
      .pipe(take(1))
      .subscribe(response => {
        this.dataSource = new MatTableDataSource(response.data.list);
        this.logCount = response.data.logCount;
      }, (err) => {
          alert(err);
      });

  }

  getEventsWithFilters(
    clusterId: number,
    limit?: number,
    page?: number,
    selectedPriorityLevels?: string [],
    selectedOrderBy?: string,
    startDate?: string,
    endDate?: string
  ){
    this.falcoService.getFalcoLogs(clusterId, limit, page, selectedPriorityLevels, selectedOrderBy, startDate, endDate)
      .pipe(take(1))
      .subscribe(response => {
        this.dataSource = new MatTableDataSource(response.data.list);
        this.logCount = response.data.logCount;
      }, (err) => {
        alert(err);
      });
  }

  displayEventDetails(event: IFalcoLog) {
    this.dialogRef = this.dialog.open(ShowJsonDataComponent, {
      width: 'auto',
      data: {content: event, header: 'Event Log Details'}
    });
  }


  downloadReport() {
    this.loaderService.start('csv-download');
    let startDate;
    let endDate;
    if (this.filterForm.get('startDate').value) {
      startDate = format(new Date(this.filterForm.get('startDate').value), 'yyyy-MM-dd');
    }
    if (this.filterForm.get('endDate').value) {
      endDate = format(new Date(this.filterForm.get('endDate').value), 'yyyy-MM-dd');
    }
    this.falcoService.downloadFalcoExport(this.clusterId)
        .pipe(take(1))
        .subscribe((response) => {
          this.csvService.downloadCsvFile(response.data.csv, response.data.filename);
        }, (error) => {
          this.loaderService.stop('csv-download');
          alert(`Error downloading report: ${error?.error?.message}`);
        }, () => {
          this.loaderService.stop('csv-download');
        });
    }


  rebuildWithFilters(){
    if (!this.filtersValid) {
      alert('Invalid filter settings; please recheck filter values');
    }else {

      let startDate;
      let endDate;
      if (this.filterForm.get('startDate').value) {
        startDate = format(new Date(this.filterForm.get('startDate').value), 'yyyy-MM-dd');
      }
      if (this.filterForm.get('endDate').value) {
        endDate = format(new Date(this.filterForm.get('endDate').value), 'yyyy-MM-dd');
      }

      this.getEventsWithFilters(
        this.clusterId,
        this.limit,
        this.page,
        this.filterForm.get('selectedPriorityLevels').value,
        this.filterForm.get('selectedOrderBy').value,
        startDate,
        endDate
      );
    }
  }

  get filtersValid(): boolean {
    return this.filterForm.valid;
  }

  getLimitFromLocalStorage(): string | null {
    return localStorage.getItem('falco_table_limit');
  }

  setLimitToLocalStorage(limit: number) {
    localStorage.setItem('falco_table_limit', String(limit));
  }


  openDialog() {
    const dialog = this.dialog.open(FalcoDialogComponent, {
      maxWidth: '800px',
      maxHeight: '80vh',
      closeOnNavigation: true,
      disableClose: false,
      data: {
        clusterId: this.clusterId,
      }
    });

    dialog.afterClosed()
      .pipe(take(1))
      .subscribe((data?: { dontRefresh?: boolean }) => {
        // If closed after navigating away, dontRefresh should be true.
        // If closing by clicking off the modal data will be undefined
        if (!data?.dontRefresh) {
          this.getEvents();
        }
      });
  }

  stripDomainName(image: string): string {
    const regex = /^([a-zA-Z0-9]+\.[a-zA-Z0-9\.]+)?\/?([a-zA-Z0-9\/]+)?\:?([a-zA-Z0-9\.]+)?$/g;
    const group = image.split(regex);
    // strip domain, only image
    if (group[2] !== undefined && group[3] === undefined){
      return (group[2]);
    } else if (group[3] !== undefined){
      return (group[2] + group [3]);
    } else if (group[2] === undefined){
      return '';
    }
  }
}
